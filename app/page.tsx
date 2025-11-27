'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { 
  ArrowRight, 
  TrendingUp, 
  Globe,
  Shield,
  Zap,
  Building2,
  FileSpreadsheet,
  RefreshCw,
  Lock,
  BarChart3,
  Check
} from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [isLoaded, setIsLoaded] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [activeIntegration, setActiveIntegration] = useState(0);

  useEffect(() => {
    if (user) {
      router.push('/dashboard');
    }
  }, [user, router]);

  useEffect(() => {
    setIsLoaded(true);
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-rotate integrations
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIntegration((prev) => (prev + 1) % 4);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const integrations = [
    { name: 'Tink', description: '3,500+ European Banks', region: 'Europe' },
    { name: 'Plaid', description: '12,000+ Global Institutions', region: 'Global' },
    { name: 'Xero', description: 'Accounting Integration', region: 'Worldwide' },
    { name: 'CSV Import', description: 'Any Bank Statement', region: 'Universal' },
  ];

  const features = [
    {
      icon: Globe,
      title: 'Multi-Currency Treasury',
      description: '30+ currencies with real-time exchange rates. Track USD, EUR, GBP, and more in a unified view.',
    },
    {
      icon: Building2,
      title: 'Multi-Entity Support',
      description: 'Manage multiple legal entities, subsidiaries, and business units from one dashboard.',
    },
    {
      icon: RefreshCw,
      title: 'Automatic Bank Sync',
      description: 'Connect once, sync forever. Transactions flow in automatically from 15,000+ banks worldwide.',
    },
    {
      icon: BarChart3,
      title: 'AI Forecasting',
      description: 'Machine learning models that understand your cash patterns and predict future positions.',
    },
    {
      icon: FileSpreadsheet,
      title: 'Smart CSV Import',
      description: 'Drag, drop, done. Intelligent column mapping handles any bank statement format.',
    },
    {
      icon: Lock,
      title: 'Enterprise Security',
      description: 'SOC 2 compliant. Bank-grade encryption. Row-level security isolates every tenant.',
    },
  ];

  return (
    <div className="min-h-screen bg-white text-stone-900">
      {/* Background - properly layered behind content */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000008_1px,transparent_1px),linear-gradient(to_bottom,#00000008_1px,transparent_1px)] bg-[size:64px_64px]" />
        <div className="absolute top-0 right-0 w-[50%] h-[60%] bg-gradient-to-bl from-[#047857]/[0.03] to-transparent" />
      </div>

      {/* Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrollY > 50 ? 'bg-white/80 backdrop-blur-xl shadow-sm' : ''
      }`}>
        <div className="w-full px-6 lg:px-12">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-white font-black text-lg">S</span>
              </div>
              <span className="text-xl font-black tracking-tight">Strategy</span>
            </div>
            
            <div className="hidden md:flex items-center gap-10">
              <a href="#features" className="text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors">Features</a>
              <a href="#integrations" className="text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors">Integrations</a>
              <a href="#security" className="text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors">Security</a>
            </div>

            <div className="flex items-center gap-3">
              <Link href="/login">
                <button className="px-5 py-2.5 text-stone-600 font-medium hover:text-stone-900 transition-colors">
                  Sign In
                </button>
              </Link>
              <Link href="/signup">
                <button className="px-6 py-2.5 bg-[#047857] text-white rounded-lg font-semibold hover:bg-[#065f46] transition-all">
                  Get Started
                </button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section - Full Width */}
      <section className="relative pt-28 lg:pt-32">
        <div className="w-full px-6 lg:px-12 pb-16 lg:pb-24">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Left Content */}
            <div className={`transition-all duration-1000 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
              <div className="flex items-center gap-3 mb-8">
                <span className="h-px w-12 bg-[#047857]"></span>
                <span className="text-[#047857] text-xs font-bold uppercase tracking-[0.2em]">Treasury Intelligence Platform</span>
              </div>

              <h1 className="text-[clamp(2.5rem,6vw,4.5rem)] font-bold leading-[0.95] tracking-tight mb-6">
                Every account.
                <br />
                Every currency.
                <br />
                <span className="text-[#047857]">One view.</span>
              </h1>

              <p className="text-lg lg:text-xl text-stone-500 leading-relaxed mb-8 max-w-lg">
                This platform connects to 15,000+ banks worldwide, syncs your transactions automatically, 
                and gives you real-time visibility across every entity and currency.
              </p>

              <div className="flex flex-col sm:flex-row items-start gap-4 mb-12">
                <Link href="/signup">
                  <button className="group px-8 py-4 bg-stone-900 text-white rounded-lg font-semibold flex items-center gap-3 hover:bg-stone-800 transition-all w-full sm:w-auto justify-center">
                    Start Free Trial
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                </Link>
                <button className="group flex items-center gap-2 px-8 py-4 text-stone-600 font-medium hover:text-[#047857] transition-colors">
                  <span>See it in action</span>
                </button>
              </div>

              {/* Trust indicators */}
              <div className="flex flex-wrap items-center gap-6 text-sm text-stone-400">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#047857]" />
                  <span>SOC 2 Compliant</span>
                </div>
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[#047857]" />
                  <span>30+ Currencies</span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#047857]" />
                  <span>5 min setup</span>
                </div>
              </div>
            </div>

            {/* Right: Dashboard Preview */}
            <div className={`transition-all duration-1000 delay-200 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
              <div className="relative">
                {/* Main Dashboard Card */}
                <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl shadow-stone-900/5 overflow-hidden">
                  {/* Header */}
                  <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-stone-300"></div>
                      <div className="w-3 h-3 rounded-full bg-stone-300"></div>
                      <div className="w-3 h-3 rounded-full bg-stone-300"></div>
                    </div>
                    <span className="text-xs text-stone-400 font-medium">Dashboard</span>
                  </div>
                  
                  <div className="p-6 lg:p-8">
                    {/* Total */}
                    <div className="mb-8">
                      <div className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-2">Consolidated Cash Position</div>
                      <div className="flex items-end gap-4">
                        <span className="text-4xl lg:text-5xl font-bold tracking-tight">$12,847,350</span>
                        <div className="flex items-center gap-1 px-2.5 py-1 bg-[#d1fae5] rounded-full mb-2">
                          <TrendingUp className="w-3.5 h-3.5 text-[#047857]" />
                          <span className="text-sm font-bold text-[#047857]">+12.4%</span>
                        </div>
                      </div>
                    </div>

                    {/* Currency breakdown */}
                    <div className="grid grid-cols-3 gap-3 mb-6">
                      {[
                        { currency: 'USD', amount: '$8.2M', flag: '🇺🇸' },
                        { currency: 'EUR', amount: '€3.1M', flag: '🇪🇺' },
                        { currency: 'GBP', amount: '£1.2M', flag: '🇬🇧' },
                      ].map((item, i) => (
                        <div key={i} className="p-3 bg-stone-50 rounded-xl border border-stone-100">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-base">{item.flag}</span>
                            <span className="text-xs text-stone-400 font-medium">{item.currency}</span>
                          </div>
                          <div className="text-lg font-bold text-stone-900">{item.amount}</div>
                        </div>
                      ))}
                    </div>

                    {/* Entity list */}
                    <div className="space-y-2">
                      {[
                        { name: 'US Operations', accounts: 12, balance: '$5.4M' },
                        { name: 'EU Subsidiary', accounts: 8, balance: '€2.8M' },
                        { name: 'UK Holdings', accounts: 5, balance: '£1.1M' },
                      ].map((entity, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-lg hover:bg-stone-50 transition-colors cursor-pointer group">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-[#047857]/10 flex items-center justify-center">
                              <Building2 className="w-4 h-4 text-[#047857]" />
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-stone-900">{entity.name}</div>
                              <div className="text-xs text-stone-400">{entity.accounts} accounts</div>
                            </div>
                          </div>
                          <div className="text-sm font-bold text-stone-900">{entity.balance}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Floating integration card */}
                <div className={`absolute -bottom-4 -left-4 lg:-left-8 bg-white rounded-xl border border-stone-200 shadow-xl p-4 transition-all duration-500 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '600ms' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#047857] flex items-center justify-center">
                      <RefreshCw className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="text-xs text-stone-400">Last sync</div>
                      <div className="text-sm font-bold text-stone-900">2 minutes ago</div>
                    </div>
                  </div>
                </div>

                {/* Floating forecast card */}
                <div className={`absolute -top-4 -right-4 lg:-right-8 bg-[#047857] text-white rounded-xl shadow-xl p-4 transition-all duration-500 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '800ms' }}>
                  <div className="text-xs text-[#a7f3d0] mb-1">30-Day Forecast</div>
                  <div className="text-2xl font-black">$14.2M</div>
                  <div className="text-xs text-[#a7f3d0] flex items-center gap-1 mt-1">
                    <TrendingUp className="w-3 h-3" />
                    94.7% accuracy
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Integrations Section */}
      <section id="integrations" className="py-24 border-t border-stone-100">
        <div className="w-full px-6 lg:px-12">
          <div className="text-center mb-16">
            <div className="flex items-center justify-center gap-3 mb-4">
              <span className="h-px w-12 bg-[#047857]"></span>
              <span className="text-[#047857] text-xs font-bold uppercase tracking-[0.2em]">Integrations</span>
              <span className="h-px w-12 bg-[#047857]"></span>
            </div>
            <h2 className="text-3xl lg:text-4xl font-black tracking-tight mb-4">
              Connect to 15,000+ banks
            </h2>
            <p className="text-lg text-stone-500 max-w-2xl mx-auto">
              One platform, every bank. From major institutions to regional banks, we&apos;ve got you covered.
            </p>
          </div>

          {/* Integration cards */}
          <div className="grid md:grid-cols-4 gap-4 mb-12">
            {integrations.map((integration, i) => (
              <button
                key={i}
                onClick={() => setActiveIntegration(i)}
                className={`p-6 rounded-xl text-left transition-all ${
                  activeIntegration === i 
                    ? 'bg-[#047857] text-white shadow-lg shadow-[#047857]/20' 
                    : 'bg-stone-50 hover:bg-stone-100'
                }`}
              >
                <div className={`text-xs font-bold uppercase tracking-wider mb-2 ${
                  activeIntegration === i ? 'text-[#a7f3d0]' : 'text-stone-400'
                }`}>
                  {integration.region}
                </div>
                <div className="text-xl font-bold mb-1">{integration.name}</div>
                <div className={`text-sm ${activeIntegration === i ? 'text-[#a7f3d0]' : 'text-stone-500'}`}>
                  {integration.description}
                </div>
              </button>
            ))}
          </div>

          {/* Bank logos placeholder */}
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 text-stone-300">
            {['Chase', 'Bank of America', 'Barclays', 'Deutsche Bank', 'HSBC', 'Citi', 'Wells Fargo', 'Santander'].map((bank, i) => (
              <span key={i} className="text-xl font-bold tracking-tight hover:text-stone-400 transition-colors">{bank}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 bg-stone-50">
        <div className="w-full px-6 lg:px-12">
          <div className="text-center mb-16">
            <div className="flex items-center justify-center gap-3 mb-4">
              <span className="h-px w-12 bg-[#047857]"></span>
              <span className="text-[#047857] text-xs font-bold uppercase tracking-[0.2em]">Features</span>
              <span className="h-px w-12 bg-[#047857]"></span>
            </div>
            <h2 className="text-3xl lg:text-4xl font-black tracking-tight mb-4">
              Built for modern treasury
            </h2>
            <p className="text-lg text-stone-500 max-w-2xl mx-auto">
              Everything you need to manage cash across entities, currencies, and banking relationships.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <div 
                key={i}
                className="group p-8 bg-white rounded-2xl border border-stone-200 hover:border-[#047857]/30 hover:shadow-xl hover:shadow-stone-900/5 transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-[#047857]/10 flex items-center justify-center mb-6 group-hover:bg-[#047857] group-hover:scale-110 transition-all">
                  <feature.icon className="w-6 h-6 text-[#047857] group-hover:text-white transition-colors" />
                </div>
                <h3 className="text-xl font-bold text-stone-900 mb-3">{feature.title}</h3>
                <p className="text-stone-500 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section id="security" className="py-24">
        <div className="w-full px-6 lg:px-12">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="h-px w-12 bg-[#047857]"></span>
                <span className="text-[#047857] text-xs font-bold uppercase tracking-[0.2em]">Security</span>
              </div>
              <h2 className="text-3xl lg:text-4xl font-black tracking-tight mb-6">
                Enterprise-grade security.
                <br />
                <span className="text-[#047857]">No compromises.</span>
              </h2>
              <p className="text-lg text-stone-500 leading-relaxed mb-8">
                Your financial data is protected by the same security standards used by major banks. 
                Multi-tenant architecture ensures complete data isolation.
              </p>

              <div className="space-y-4">
                {[
                  'SOC 2 Type II Compliant',
                  'Bank-grade AES-256 encryption',
                  'Row-level security (RLS) isolation',
                  'Complete audit trail',
                  'SSO & MFA support',
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#047857]/10 flex items-center justify-center">
                      <Check className="w-4 h-4 text-[#047857]" />
                    </div>
                    <span className="text-stone-700 font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="bg-stone-900 rounded-2xl p-8 lg:p-12">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-16 h-16 rounded-xl bg-[#047857] flex items-center justify-center">
                    <Shield className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <div className="text-white font-bold text-xl">SOC 2 Certified</div>
                    <div className="text-stone-400">Type II Compliant</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Uptime', value: '99.9%' },
                    { label: 'Encryption', value: 'AES-256' },
                    { label: 'Data Centers', value: 'Global' },
                    { label: 'Backups', value: 'Hourly' },
                  ].map((stat, i) => (
                    <div key={i} className="p-4 bg-stone-800 rounded-xl">
                      <div className="text-stone-400 text-xs uppercase tracking-wider mb-1">{stat.label}</div>
                      <div className="text-white font-bold text-lg">{stat.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-[#047857]">
        <div className="w-full px-6 lg:px-12 text-center">
          <h2 className="text-3xl lg:text-5xl font-black text-white mb-6 tracking-tight">
            Ready to see clearly?
          </h2>
          <p className="text-xl text-[#a7f3d0] mb-10 max-w-2xl mx-auto">
            Join modern finance teams who trust this platform for treasury intelligence. 
            Start free, no credit card required.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup">
              <button className="group px-10 py-5 bg-white text-[#047857] rounded-lg font-bold text-lg flex items-center gap-3 hover:bg-stone-50 transition-all w-full sm:w-auto justify-center">
                Get Started Free
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </Link>
            <Link href="/login">
              <button className="px-10 py-5 text-white font-semibold text-lg border-2 border-white/30 rounded-lg hover:bg-white/10 transition-all w-full sm:w-auto">
                Sign In
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-stone-200">
        <div className="w-full px-6 lg:px-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#047857] flex items-center justify-center">
                <span className="text-white font-black text-sm">S</span>
              </div>
              <span className="text-lg font-black tracking-tight">STRATIRI</span>
            </div>
            <div className="flex items-center gap-8 text-sm text-stone-500">
              <a href="#" className="hover:text-stone-900 transition-colors">Privacy</a>
              <a href="#" className="hover:text-stone-900 transition-colors">Terms</a>
              <a href="#" className="hover:text-stone-900 transition-colors">Security</a>
              <a href="#" className="hover:text-stone-900 transition-colors">Contact</a>
            </div>
            <p className="text-sm text-stone-400">© 2025 Strategic Finance. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* Fonts now loaded via Next.js font optimization in layout.tsx */}
    </div>
  );
}
