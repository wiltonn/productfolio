export const PRICING_CONTENT = {
  plans: [
    {
      id: 'starter',
      name: 'Starter',
      price: '$49/seat/mo',
      seatLimit: 5,
      features: [
        'Up to 5 decision seats',
        'Unlimited observers & resources',
        'Initiative management',
        'Scenario planning',
        'Employee capacity tracking',
        'Basic reporting',
      ],
    },
    {
      id: 'growth',
      name: 'Growth',
      price: '$99/seat/mo',
      seatLimit: 25,
      features: [
        'Up to 25 decision seats',
        'Everything in Starter',
        'Token flow planning',
        'Flow forecasting (Mode A & B)',
        'Approval workflows',
        'Drift detection & alerts',
      ],
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 'Custom',
      seatLimit: null,
      features: [
        'Unlimited decision seats',
        'Everything in Growth',
        'Job profiles & cost bands',
        'Org structure management',
        'Jira integration',
        'Authority registry',
        'Priority support & SLA',
      ],
    },
  ],
  seatDefinition: {
    licensed:
      'Decision-makers: PMs, Directors, Resource Managers who create, approve, or modify plans',
    free: 'Resources (engineers, designers), read-only stakeholders, and observers',
  },
  faq: [
    {
      q: 'Who counts as a licensed user?',
      a: 'Any user who creates, modifies, or approves initiatives, scenarios, forecasts, or resource allocations. These are users with write or admin permissions.',
    },
    {
      q: 'Are engineers and designers free?',
      a: 'Yes. Employees modeled in the system (resources) and read-only viewers are always free and unlimited.',
    },
    {
      q: 'Can I change plans?',
      a: 'Yes. Upgrade or downgrade at any time. Changes take effect at the next billing cycle.',
    },
    {
      q: 'What happens when I hit the seat limit?',
      a: 'New users with decision permissions will receive an error. Existing decision-seat users are not affected. Contact sales to upgrade.',
    },
  ],
};
