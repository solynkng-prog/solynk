const { query, transaction } = require('../../config/database');
const { stripe, PLAN_PRICES, PLAN_CONFIG } = require('../../config/stripe');
const { paystack, PAYSTACK_PLANS } = require('../../config/paystack');
const crypto = require('crypto');
const logger = require('../../shared/utils/logger');

class SubscriptionsController {
  static async initializePaystack(req, res, next) {
    try {
      const { plan } = req.body;
      const config = PAYSTACK_PLANS[plan];
      if (!config) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_PLAN', message: 'Paystack supports Premium and Installer plans only' },
        });
      }
      if (!process.env.PAYSTACK_SECRET_KEY || !config.planCode) {
        return res.status(503).json({
          success: false,
          error: { code: 'PAYSTACK_NOT_CONFIGURED', message: 'Paystack billing is not configured' },
        });
      }

      const userResult = await query('SELECT email, name FROM users WHERE id = $1', [req.user.id]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User account was not found' },
        });
      }
      const user = userResult.rows[0];
      const reference = `solynk_${req.user.id}_${Date.now()}`;
      const response = await paystack.post('/transaction/initialize', {
        email: user.email,
        // PLAN_CONFIG prices are stored in the provider's lowest USD unit (cents).
        amount: config.price,
        currency: process.env.PAYSTACK_CURRENCY || 'USD',
        plan: config.planCode,
        reference,
        callback_url: process.env.PAYSTACK_CALLBACK_URL,
        metadata: { userId: req.user.id, plan, name: user.name },
      });

      await query(
        `INSERT INTO subscriptions
          (user_id, plan, price, billing_cycle, currency, status, paystack_transaction_reference)
         VALUES ($1, $2, $3, 'monthly', $4, 'expired', $5)`,
        [req.user.id, plan, config.price, process.env.PAYSTACK_CURRENCY || 'USD', reference]
      );

      res.status(201).json({
        success: true,
        data: {
          authorizationUrl: response.data.data.authorization_url,
          accessCode: response.data.data.access_code,
          reference: response.data.data.reference,
          plan,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async verifyPaystack(req, res, next) {
    try {
      if (!process.env.PAYSTACK_SECRET_KEY) {
        return res.status(503).json({
          success: false,
          error: { code: 'PAYSTACK_NOT_CONFIGURED', message: 'Paystack billing is not configured' },
        });
      }
      const result = await paystack.get(`/transaction/verify/${encodeURIComponent(req.params.reference)}`);
      const payment = result.data.data;
      if (payment.customer?.email !== req.user.email || payment.status !== 'success') {
        return res.status(400).json({
          success: false,
          error: { code: 'PAYMENT_NOT_VERIFIED', message: 'Payment could not be verified' },
        });
      }
      await this.grantPaystackAccess(payment);
      res.json({ success: true, data: { status: payment.status, plan: payment.metadata?.plan } });
    } catch (err) {
      next(err);
    }
  }

  static async paystackWebhook(req, res) {
    try {
      const signature = req.headers['x-paystack-signature'];
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
      const expected = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY || '').update(body).digest('hex');
      if (!signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        return res.status(401).json({ success: false, error: { code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' } });
      }

      const event = JSON.parse(body.toString('utf8'));
      if (event.event === 'charge.success') {
        await this.grantPaystackAccess(event.data);
      } else if (event.event === 'subscription.disable' || event.event === 'invoice.payment_failed') {
        const code = event.data.subscription_code || event.data.subscription?.subscription_code;
        if (code) {
          await query(
            `UPDATE subscriptions SET status = 'past_due', updated_at = CURRENT_TIMESTAMP
             WHERE paystack_subscription_code = $1`,
            [code]
          );
        }
      }
      logger.info('Paystack webhook processed', { type: event.event });
      return res.json({ received: true });
    } catch (err) {
      logger.error('Paystack webhook error:', err);
      return res.status(400).json({ success: false, error: { code: 'WEBHOOK_ERROR', message: 'Webhook could not be processed' } });
    }
  }

  static async grantPaystackAccess(payment) {
    const reference = payment.reference;
    const metadata = payment.metadata || {};
    const plan = metadata.plan;
    const config = PAYSTACK_PLANS[plan];
    if (!reference || !config || payment.status !== 'success') return;

    const existing = await query(
      'SELECT id, user_id FROM subscriptions WHERE paystack_transaction_reference = $1 LIMIT 1',
      [reference]
    );
    if (existing.rows.length === 0) return;

    const userId = existing.rows[0].user_id;
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    await transaction(async client => {
      await client.query(
        `UPDATE subscriptions SET status = 'active', plan = $1, price = $2,
          current_period_start = CURRENT_TIMESTAMP, current_period_end = $3,
          paystack_subscription_code = $4, paystack_customer_code = $5,
          updated_at = CURRENT_TIMESTAMP WHERE id = $6`,
        [plan, config.price, periodEnd, payment.subscription?.subscription_code || null,
          payment.customer?.customer_code || null, existing.rows[0].id]
      );
      await client.query(
        `UPDATE users SET plan = $1, plan_expires_at = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
        [plan, periodEnd, userId]
      );
    });
  }

  /**
   * GET /billing/plans
   * List available plans
   */
  static async getPlans(req, res, next) {
    try {
      const plans = Object.entries(PLAN_CONFIG).map(([key, config]) => ({
        id: key,
        name: config.name,
        price: config.price,
        period: config.period,
        limits: config.limits,
        features: config.features,
      }));

      res.json({
        success: true,
        data: plans,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /billing/current
   * Get current subscription
   */
  static async getCurrent(req, res, next) {
    try {
      const userId = req.user.id;

      const result = await query(
        `SELECT s.*, 
                (SELECT COUNT(*) FROM projects WHERE user_id = $1 AND status != 'archived') as projects_used,
                (SELECT COUNT(*) FROM calculation_logs WHERE user_id = $1) as calculations_used,
                (SELECT COUNT(*) FROM reports WHERE user_id = $1) as reports_used
         FROM subscriptions s
         WHERE s.user_id = $1 AND s.status = 'active'
         ORDER BY s.created_at DESC
         LIMIT 1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return res.json({
          success: true,
          data: {
            plan: 'free',
            status: 'active',
            limits: PLAN_CONFIG.free.limits,
            usage: { projects: 0, calculations: 0, reports: 0 },
          },
        });
      }

      const subscription = result.rows[0];
      const planConfig = PLAN_CONFIG[subscription.plan] || PLAN_CONFIG.free;

      res.json({
        success: true,
        data: {
          ...subscription,
          limits: planConfig.limits,
          usage: {
            projects: parseInt(subscription.projects_used),
            calculations: parseInt(subscription.calculations_used),
            reports: parseInt(subscription.reports_used),
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /billing/subscribe
   * Subscribe to a plan
   */
  static async subscribe(req, res, next) {
    try {
      const userId = req.user.id;
      const { plan, paymentMethodId } = req.body;

      if (!PLAN_CONFIG[plan]) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_PLAN', message: 'Invalid plan selected' }
        });
      }

      const planConfig = PLAN_CONFIG[plan];
      const priceId = PLAN_PRICES[plan];

      if (!priceId) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_PLAN', message: 'Plan not available for subscription' }
        });
      }

      // Get or create Stripe customer
      let customerId;
      const existingSub = await query(
        'SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1 AND stripe_customer_id IS NOT NULL LIMIT 1',
        [userId]
      );

      if (existingSub.rows.length > 0) {
        customerId = existingSub.rows[0].stripe_customer_id;
      } else {
        const userResult = await query('SELECT email, name FROM users WHERE id = $1', [userId]);
        const user = userResult.rows[0];

        const customer = await stripe.customers.create({
          email: user.email,
          name: user.name,
          payment_method: paymentMethodId,
          invoice_settings: { default_payment_method: paymentMethodId },
        });
        customerId = customer.id;
      }

      // Create subscription
      const stripeSubscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        trial_period_days: plan === 'premium' ? 14 : 0,
        metadata: { userId, plan },
      });

      // Save to database
      const result = await query(
        `INSERT INTO subscriptions (
          user_id, plan, price, billing_cycle, status,
          stripe_subscription_id, stripe_customer_id,
          current_period_start, current_period_end
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8), to_timestamp($9))
        RETURNING *`,
        [
          userId, plan, planConfig.price, 'monthly',
          stripeSubscription.status === 'trialing' ? 'trialing' : 'active',
          stripeSubscription.id, customerId,
          stripeSubscription.current_period_start,
          stripeSubscription.current_period_end,
        ]
      );

      // Update user plan
      await query('UPDATE users SET plan = $1 WHERE id = $2', [plan, userId]);

      logger.info('Subscription created', { userId, plan, stripeSubId: stripeSubscription.id });

      res.status(201).json({
        success: true,
        data: {
          subscription: result.rows[0],
          stripeSubscription: {
            id: stripeSubscription.id,
            status: stripeSubscription.status,
            currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /billing/upgrade
   */
  static async upgrade(req, res, next) {
    try {
      const userId = req.user.id;
      const { plan } = req.body;

      const currentSub = await query(
        'SELECT * FROM subscriptions WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 1',
        [userId, 'active']
      );

      if (currentSub.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'NO_SUBSCRIPTION', message: 'No active subscription to upgrade' }
        });
      }

      const subscription = currentSub.rows[0];
      const priceId = PLAN_PRICES[plan];

      if (!priceId) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_PLAN', message: 'Invalid upgrade plan' }
        });
      }

      // Update Stripe subscription
      const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);

      await stripe.subscriptions.update(subscription.stripe_subscription_id, {
        items: [{
          id: stripeSubscription.items.data[0].id,
          price: priceId,
        }],
        proration_behavior: 'create_prorations',
      });

      // Update database
      const newPlanConfig = PLAN_CONFIG[plan];
      await query(
        'UPDATE subscriptions SET plan = $1, price = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        [plan, newPlanConfig.price, subscription.id]
      );

      await query('UPDATE users SET plan = $1 WHERE id = $2', [plan, userId]);

      res.json({
        success: true,
        message: `Upgraded to ${newPlanConfig.name} plan`,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /billing/cancel
   */
  static async cancel(req, res, next) {
    try {
      const userId = req.user.id;

      const currentSub = await query(
        'SELECT * FROM subscriptions WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 1',
        [userId, 'active']
      );

      if (currentSub.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'NO_SUBSCRIPTION', message: 'No active subscription' }
        });
      }

      const subscription = currentSub.rows[0];

      // Cancel at period end
      await stripe.subscriptions.update(subscription.stripe_subscription_id, {
        cancel_at_period_end: true,
      });

      await query(
        "UPDATE subscriptions SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP WHERE id = $1",
        [subscription.id]
      );

      res.json({
        success: true,
        message: 'Subscription will cancel at the end of the billing period',
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /billing/invoices
   */
  static async getInvoices(req, res, next) {
    try {
      const userId = req.user.id;

      const subResult = await query(
        'SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1 AND stripe_customer_id IS NOT NULL LIMIT 1',
        [userId]
      );

      if (subResult.rows.length === 0) {
        return res.json({ success: true, data: [] });
      }

      const customerId = subResult.rows[0].stripe_customer_id;
      const invoices = await stripe.invoices.list({
        customer: customerId,
        limit: 20,
      });

      res.json({
        success: true,
        data: invoices.data.map(inv => ({
          id: inv.id,
          amount: inv.amount_due,
          status: inv.status,
          date: new Date(inv.created * 1000),
          pdfUrl: inv.invoice_pdf,
        })),
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /billing/usage
   */
  static async getUsage(req, res, next) {
    try {
      const userId = req.user.id;

      const result = await query(
        `SELECT 
          (SELECT COUNT(*) FROM projects WHERE user_id = $1 AND status != 'archived') as projects,
          (SELECT COUNT(*) FROM calculation_logs WHERE user_id = $1 AND created_at > CURRENT_DATE - INTERVAL '30 days') as calculations,
          (SELECT COUNT(*) FROM reports WHERE user_id = $1 AND created_at > CURRENT_DATE - INTERVAL '30 days') as reports`,
        [userId]
      );

      res.json({
        success: true,
        data: result.rows[0],
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /billing/webhook
   * Stripe webhook handler
   */
  static async webhook(req, res, next) {
    try {
      const sig = req.headers['stripe-signature'];
      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      logger.info('Stripe webhook received', { type: event.type });

      switch (event.type) {
        case 'invoice.payment_succeeded':
          await this.handlePaymentSucceeded(event.data.object);
          break;
        case 'invoice.payment_failed':
          await this.handlePaymentFailed(event.data.object);
          break;
        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object);
          break;
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event.data.object);
          break;
      }

      res.json({ received: true });
    } catch (err) {
      logger.error('Webhook error:', err);
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }

  static async handlePaymentSucceeded(invoice) {
    const subscriptionId = invoice.subscription;
    await query(
      "UPDATE subscriptions SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE stripe_subscription_id = $1",
      [subscriptionId]
    );
  }

  static async handlePaymentFailed(invoice) {
    const subscriptionId = invoice.subscription;
    await query(
      "UPDATE subscriptions SET status = 'past_due', updated_at = CURRENT_TIMESTAMP WHERE stripe_subscription_id = $1",
      [subscriptionId]
    );
  }

  static async handleSubscriptionDeleted(subscription) {
    const userId = subscription.metadata.userId;
    await query(
      "UPDATE subscriptions SET status = 'expired' WHERE stripe_subscription_id = $1",
      [subscription.id]
    );
    await query("UPDATE users SET plan = 'free' WHERE id = $1", [userId]);
  }

  static async handleSubscriptionUpdated(subscription) {
    await query(
      `UPDATE subscriptions 
       SET status = $1, current_period_start = to_timestamp($2), current_period_end = to_timestamp($3)
       WHERE stripe_subscription_id = $4`,
      [subscription.status, subscription.current_period_start, subscription.current_period_end, subscription.id]
    );
  }
}

module.exports = SubscriptionsController;
