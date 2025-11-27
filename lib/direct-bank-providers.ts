export type DirectBankEnvironmentOption = {
  value: string;
  label: string;
};

export type DirectBankCredentialField = {
  key: string;
  label: string;
  required: boolean;
  type?: 'text' | 'password';
  placeholder?: string;
  helperText?: string;
  doc?: {
    doc_label: string;
    doc_url: string;
    instructions?: string;
  };
};

export type DirectBankProviderConfig = {
  id: string;
  name: string;
  shortName: string;
  country: string;
  badge?: string;
  description: string;
  docsUrl: string;
  defaultConnectionName: string;
  credentialFields: DirectBankCredentialField[];
  environmentOptions: DirectBankEnvironmentOption[];
  instructions?: string;
};

export const directBankProviders: DirectBankProviderConfig[] = [
  {
    id: 'standard_bank_sa',
    name: 'Standard Bank South Africa',
    shortName: 'Standard Bank (RSA)',
    country: 'ZA',
    badge: 'Closed Beta',
    description:
      'Collect credentials for Standard Bank’s Business Online SA APIs (OneHub Marketplace).',
    docsUrl:
      'https://corporateandinvestment.standardbank.com/cib/global/products-and-services/onehub/api-marketplace',
    defaultConnectionName: 'Standard Bank South Africa',
    credentialFields: [
      {
        key: 'appId',
        label: 'App ID (Client ID)',
        required: true,
        placeholder: 'e.g. sbx-app-12345',
        doc: {
          doc_label: 'How to get App ID',
          doc_url: 'https://www.standardbank.co.za/southafrica/business/products-and-services/business-solutions/specialised/bank-feeds',
          instructions: 'Register your app in OneHub Marketplace to retrieve your App ID (Client ID).',
        },
      },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        required: true,
        type: 'password',
        placeholder: 'Client secret from OneHub',
        doc: {
          doc_label: 'How to get Client Secret',
          doc_url: 'https://www.standardbank.co.za/southafrica/business/products-and-services/business-solutions/specialised/bank-feeds',
          instructions: 'Generate the client secret within your OneHub app for OAuth authentication.',
        },
      },
      {
        key: 'subscriptionKeyBalances',
        label: 'Subscription Key - Balance Enquiry',
        required: true,
        placeholder: 'Subscription key for Balance Enquiry API',
        helperText:
          'Subscription key from your Balance Enquiry product in OneHub. Used to fetch account balances.',
        doc: {
          doc_label: 'OneHub Subscription Keys',
          doc_url: 'https://corporateandinvestment.standardbank.com/cib/global/products-and-services/onehub/api-marketplace',
          instructions: 'Each API product (Balances, Statements, etc.) has its own subscription key.',
        },
      },
      {
        key: 'subscriptionKeyTransactions',
        label: 'Subscription Key - Statements/Transactions',
        required: true,
        placeholder: 'Subscription key for Statements API',
        helperText:
          'Subscription key from your Statements/Transactions product in OneHub. Used to fetch transaction history.',
      },
      {
        key: 'subscriptionKeyPayments',
        label: 'Subscription Key - Payments (Optional)',
        required: false,
        placeholder: 'Subscription key for Payment Initiation API',
        helperText:
          'Only required if you plan to initiate payments through Stratiri. Leave blank for read-only access.',
      },
      {
        key: 'businessUnitId',
        label: 'Business / Division ID (Optional)',
        required: false,
        placeholder: 'e.g. BU-12345',
        helperText:
          'Business Online profile identifier. Required for multi-entity structures.',
      },
    ],
    environmentOptions: [
      { value: 'sandbox', label: 'Sandbox / Non-Production' },
      { value: 'production', label: 'Production' },
    ],
    instructions:
      'Credentials stay encrypted at rest (AES-256-GCM) and never leave Stratiri’s secure vault.',
  },
];

export function getDirectBankProvider(id: string): DirectBankProviderConfig | undefined {
  return directBankProviders.find((provider) => provider.id === id);
}

