// Banking Provider Registry
// Central registry for all banking providers

import { BankingProvider, ProviderMetadata } from './base-provider';
import { tinkProvider } from './tink-provider';
import { plaidProvider } from './plaid-provider';

/**
 * Registry of all available banking providers
 */
class ProviderRegistry {
  private providers: Map<string, BankingProvider> = new Map();
  private metadata: Map<string, ProviderMetadata> = new Map();

  constructor() {
    // Register providers here
    this.registerProvider({
      providerId: 'tink',
      displayName: 'Tink (3,500+ European Banks)',
      factory: () => tinkProvider,
      enabled: true,
      requiredEnvVars: [
        'TINK_CLIENT_ID',
        'TINK_CLIENT_SECRET',
        'TINK_REDIRECT_URI',
      ],
    });

    this.registerProvider({
      providerId: 'plaid',
      displayName: 'Plaid (Global Banks)',
      factory: () => plaidProvider,
      enabled: true,
      requiredEnvVars: ['PLAID_CLIENT_ID', 'PLAID_SECRET'],
    });

    // Add more providers here as you build them
    // this.registerProvider({
    //   providerId: 'nordigen',
    //   displayName: 'Nordigen (EU Banks)',
    //   factory: () => new NordigenProvider(),
    //   enabled: true,
    //   requiredEnvVars: ['NORDIGEN_SECRET_ID', 'NORDIGEN_SECRET_KEY'],
    // });

    // this.registerProvider({
    //   providerId: 'plaid',
    //   displayName: 'Plaid (US Banks)',
    //   factory: () => new PlaidProvider(),
    //   enabled: true,
    //   requiredEnvVars: ['PLAID_CLIENT_ID', 'PLAID_SECRET'],
    // });
  }

  /**
   * Register a new provider
   */
  registerProvider(metadata: ProviderMetadata): void {
    if (this.providers.has(metadata.providerId)) {
      console.warn(
        `Provider ${metadata.providerId} is already registered. Skipping.`
      );
      return;
    }

    // Check if required environment variables are present
    const missingVars = metadata.requiredEnvVars.filter(
      (varName) => !process.env[varName]
    );

    if (missingVars.length > 0) {
      console.warn(
        `Provider ${metadata.providerId} is missing required environment variables: ${missingVars.join(', ')}. Provider will be disabled.`
      );
      metadata.enabled = false;
    }

    // Store metadata
    this.metadata.set(metadata.providerId, metadata);

    // Create and store provider instance if enabled
    if (metadata.enabled) {
      try {
        const provider = metadata.factory();
        
        // Validate configuration
        if (!provider.validateConfiguration()) {
          console.warn(
            `Provider ${metadata.providerId} failed configuration validation. Provider will be disabled.`
          );
          metadata.enabled = false;
          return;
        }

        this.providers.set(metadata.providerId, provider);
        console.log(`✓ Banking provider registered: ${metadata.displayName}`);
      } catch (error) {
        console.error(
          `Failed to initialize provider ${metadata.providerId}:`,
          error
        );
        metadata.enabled = false;
      }
    }
  }

  /**
   * Get a provider by ID
   */
  getProvider(providerId: string): BankingProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Get all registered providers
   */
  getAllProviders(): BankingProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get all enabled providers
   */
  getEnabledProviders(): BankingProvider[] {
    return this.getAllProviders().filter((provider) => {
      const meta = this.metadata.get(provider.config.providerId);
      return meta?.enabled ?? false;
    });
  }

  /**
   * Get provider metadata
   */
  getProviderMetadata(providerId: string): ProviderMetadata | undefined {
    return this.metadata.get(providerId);
  }

  /**
   * Get all provider metadata
   */
  getAllProviderMetadata(): ProviderMetadata[] {
    return Array.from(this.metadata.values());
  }

  /**
   * Check if a provider is enabled
   */
  isProviderEnabled(providerId: string): boolean {
    const meta = this.metadata.get(providerId);
    return meta?.enabled ?? false;
  }

  /**
   * Get providers by country
   */
  getProvidersByCountry(countryCode: string): BankingProvider[] {
    return this.getEnabledProviders().filter((provider) =>
      provider.config.supportedCountries.includes(countryCode)
    );
  }

  /**
   * Get providers by auth type
   */
  getProvidersByAuthType(
    authType: 'oauth' | 'api_key' | 'open_banking'
  ): BankingProvider[] {
    return this.getEnabledProviders().filter(
      (provider) => provider.config.authType === authType
    );
  }

  /**
   * Validate all providers
   */
  validateAllProviders(): Map<string, boolean> {
    const results = new Map<string, boolean>();
    
    for (const provider of this.getAllProviders()) {
      try {
        const isValid = provider.validateConfiguration();
        results.set(provider.config.providerId, isValid);
      } catch (error) {
        console.error(
          `Error validating provider ${provider.config.providerId}:`,
          error
        );
        results.set(provider.config.providerId, false);
      }
    }
    
    return results;
  }
}

// Export singleton instance
export const providerRegistry = new ProviderRegistry();

/**
 * Helper function to get a provider
 */
export function getProvider(providerId: string): BankingProvider {
  const provider = providerRegistry.getProvider(providerId);
  if (!provider) {
    throw new Error(`Banking provider '${providerId}' not found or not enabled`);
  }
  return provider;
}

/**
 * Helper function to get all enabled providers
 */
export function getEnabledProviders(): BankingProvider[] {
  return providerRegistry.getEnabledProviders();
}

/**
 * Helper function to check if provider exists
 */
export function hasProvider(providerId: string): boolean {
  return providerRegistry.isProviderEnabled(providerId);
}

