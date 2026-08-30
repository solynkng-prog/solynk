const Stripe = require('stripe');
require('dotenv').config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-04-10',
});

const PLAN_PRICES = {
  premium: process.env.STRIPE_PREMIUM_PRICE_ID,
  installer: process.env.STRIPE_INSTALLER_PRICE_ID,
};

const PLAN_CONFIG = {
  free: {
    name: 'Free',
    price: 0,
    limits: { projects: 3, calculations: 10, reports: 5 },
  },
  premium: {
    name: 'Premium',
    price: 2900, // cents
    limits: { projects: Infinity, calculations: Infinity, reports: Infinity },
  },
  installer: {
    name: 'Installer',
    price: 9900, // cents
    limits: { projects: Infinity, calculations: Infinity, reports: Infinity },
  },
};

module.exports = { stripe, PLAN_PRICES, PLAN_CONFIG };
