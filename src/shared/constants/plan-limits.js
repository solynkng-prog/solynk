/**
 * SOLYNK Subscription Plan Limits
 */

const PLAN_LIMITS = {
  free: {
    name: 'Free',
    price: 0,
    period: 'month',
    limits: {
      projects: 3,
      calculations: 10,
      reports: 5,
      apiRequests: 100,
    },
    features: [
      'basic_calculator',
      'standard_reports',
      'community_support',
    ],
  },
  premium: {
    name: 'Premium',
    price: 29,
    period: 'month',
    limits: {
      projects: Infinity,
      calculations: Infinity,
      reports: Infinity,
      apiRequests: 500,
    },
    features: [
      'advanced_ai',
      'unlimited_projects',
      'professional_exports',
      'priority_matching',
      'financial_modeling',
      'custom_branding',
      'api_access',
      'priority_support',
      'weather_integration',
    ],
  },
  installer: {
    name: 'Installer',
    price: 99,
    period: 'month',
    limits: {
      projects: Infinity,
      calculations: Infinity,
      reports: Infinity,
      apiRequests: 2000,
    },
    features: [
      'verified_badge',
      'lead_dashboard',
      'custom_branding',
      'account_manager',
      'white_label',
      'client_management',
      'quote_builder',
      'priority_listing',
      'analytics',
      'team_collaboration',
    ],
  },
};

const FEATURE_MATRIX = {
  basic_calculator: ['free', 'premium', 'installer'],
  standard_reports: ['free', 'premium', 'installer'],
  community_support: ['free', 'premium', 'installer'],
  advanced_ai: ['premium', 'installer'],
  unlimited_projects: ['premium', 'installer'],
  professional_exports: ['premium', 'installer'],
  priority_matching: ['premium', 'installer'],
  financial_modeling: ['premium', 'installer'],
  custom_branding: ['premium', 'installer'],
  api_access: ['premium', 'installer'],
  priority_support: ['premium', 'installer'],
  weather_integration: ['premium', 'installer'],
  verified_badge: ['installer'],
  lead_dashboard: ['installer'],
  account_manager: ['installer'],
  white_label: ['installer'],
  client_management: ['installer'],
  quote_builder: ['installer'],
  priority_listing: ['installer'],
  analytics: ['installer'],
  team_collaboration: ['installer'],
};

function checkFeatureAccess(plan, feature) {
  const allowedPlans = FEATURE_MATRIX[feature] || [];
  return allowedPlans.includes(plan);
}

function checkPlanLimit(plan, resourceType, currentUsage) {
  const limit = PLAN_LIMITS[plan]?.limits[resourceType];
  if (limit === undefined) return false;
  if (limit === Infinity) return true;
  return currentUsage < limit;
}

module.exports = {
  PLAN_LIMITS,
  FEATURE_MATRIX,
  checkFeatureAccess,
  checkPlanLimit,
};
