const axios = require('axios');
require('dotenv').config();

const PAYSTACK_API_URL = 'https://api.paystack.co';

const paystack = axios.create({
  baseURL: PAYSTACK_API_URL,
  timeout: 10000,
  headers: {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY || ''}`,
    'Content-Type': 'application/json',
  },
});

const PAYSTACK_PLANS = {
  premium: {
    name: 'Premium',
    price: 2900,
    planCode: process.env.PAYSTACK_PREMIUM_PLAN_CODE,
  },
  installer: {
    name: 'Installer',
    price: 9900,
    planCode: process.env.PAYSTACK_INSTALLER_PLAN_CODE,
  },
};

module.exports = { paystack, PAYSTACK_PLANS };
