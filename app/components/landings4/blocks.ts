/**
 * Predefined blocks for GrapesJS editor.
 * All section blocks use semantic colors (bg-primary, text-on-surface, etc.)
 */
export const LANDING_BLOCKS = [
  // ─── Basic Elements ───────────────────────────────────
  {
    id: "text-block",
    label: "Text",
    category: "Basic",
    content: `<p class="text-base text-on-surface">Edit this text. Double click to start typing.</p>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>`,
  },
  {
    id: "heading-block",
    label: "Heading",
    category: "Basic",
    content: `<h2 class="text-4xl font-black text-on-surface">Your Heading Here</h2>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16"/><path d="M4 4v16"/><path d="M20 4v16"/></svg>`,
  },
  {
    id: "image-block",
    label: "Image",
    category: "Basic",
    content: { type: "image" },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`,
  },
  {
    id: "button-block",
    label: "Button",
    category: "Basic",
    content: `<a href="#" class="inline-block px-8 py-3 bg-primary text-on-primary font-bold rounded-xl hover:opacity-90 transition">Click Me</a>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="8" rx="4"/><path d="M8 12h8"/></svg>`,
  },
  {
    id: "link-block",
    label: "Link",
    category: "Basic",
    content: `<a href="#" class="text-primary font-bold underline hover:text-primary-dark transition">Your Link</a>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  },
  {
    id: "video-block",
    label: "Video",
    category: "Basic",
    content: { type: "video" },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  },
  {
    id: "divider-block",
    label: "Divider",
    category: "Basic",
    content: `<hr class="border-t-2 border-gray-200 my-8" />`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18"/></svg>`,
  },
  {
    id: "spacer-block",
    label: "Spacer",
    category: "Basic",
    content: `<div class="h-16"></div>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"/><path d="M5 5h14"/><path d="M5 19h14"/></svg>`,
  },
  // ─── Layout ───────────────────────────────────────────
  {
    id: "container-block",
    label: "Container",
    category: "Layout",
    content: `<div class="max-w-6xl mx-auto px-6 py-12"></div>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`,
  },
  {
    id: "two-columns",
    label: "2 Columns",
    category: "Layout",
    content: `<div class="grid grid-cols-2 gap-8 px-6 py-12 max-w-6xl mx-auto">
  <div class="bg-surface-alt rounded-xl p-8 min-h-[120px]"></div>
  <div class="bg-surface-alt rounded-xl p-8 min-h-[120px]"></div>
</div>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="9" height="18" rx="1"/><rect x="13" y="3" width="9" height="18" rx="1"/></svg>`,
  },
  {
    id: "three-columns",
    label: "3 Columns",
    category: "Layout",
    content: `<div class="grid grid-cols-3 gap-6 px-6 py-12 max-w-6xl mx-auto">
  <div class="bg-surface-alt rounded-xl p-6 min-h-[120px]"></div>
  <div class="bg-surface-alt rounded-xl p-6 min-h-[120px]"></div>
  <div class="bg-surface-alt rounded-xl p-6 min-h-[120px]"></div>
</div>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="6" height="18" rx="1"/><rect x="9" y="3" width="6" height="18" rx="1"/><rect x="17" y="3" width="6" height="18" rx="1"/></svg>`,
  },
  // ─── Heroes ───────────────────────────────────────────
  {
    id: "hero-centered",
    label: "Hero Centered",
    category: "Heroes",
    content: `<section class="bg-primary py-24 px-6 text-center">
  <div class="max-w-4xl mx-auto">
    <h1 class="text-5xl md:text-7xl font-black text-on-primary mb-6">Your Amazing Headline</h1>
    <p class="text-xl text-on-primary/80 mb-10 max-w-2xl mx-auto">A compelling subtitle that explains your value proposition in one or two sentences.</p>
    <div class="flex gap-4 justify-center flex-wrap">
      <a href="#" class="px-8 py-4 bg-accent text-on-accent font-bold rounded-xl hover:opacity-90 transition">Get Started</a>
      <a href="#" class="px-8 py-4 border-2 border-on-primary text-on-primary font-bold rounded-xl hover:bg-on-primary/10 transition">Learn More</a>
    </div>
  </div>
</section>`,
    media: `<svg viewBox="0 0 24 12" fill="none"><rect width="24" height="12" rx="1" fill="#f3f4f6"/><rect x="6" y="2" width="12" height="2" rx=".5" fill="#6366f1"/><rect x="8" y="5" width="8" height="1" rx=".25" fill="#9ca3af"/><rect x="9" y="8" width="3" height="1.5" rx=".5" fill="#6366f1"/><rect x="13" y="8" width="3" height="1.5" rx=".5" fill="#d1d5db"/></svg>`,
  },
  {
    id: "hero-split",
    label: "Hero Split",
    category: "Heroes",
    content: `<section class="bg-surface py-20 px-6">
  <div class="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
    <div>
      <h1 class="text-5xl font-black text-on-surface mb-6">Build Something Amazing</h1>
      <p class="text-lg text-on-surface/70 mb-8">Describe your product or service. Focus on the benefits and what makes you different.</p>
      <a href="#" class="inline-block px-8 py-4 bg-primary text-on-primary font-bold rounded-xl hover:opacity-90 transition">Start Now</a>
    </div>
    <img src="https://placehold.co/600x400/e2e8f0/64748b?text=Your+Image" alt="Hero image" class="rounded-2xl w-full" />
  </div>
</section>`,
    media: `<svg viewBox="0 0 24 12" fill="none"><rect width="24" height="12" rx="1" fill="#f3f4f6"/><rect x="1" y="2" width="10" height="2" rx=".5" fill="#6366f1"/><rect x="1" y="5" width="8" height="1" rx=".25" fill="#9ca3af"/><rect x="1" y="8" width="4" height="1.5" rx=".5" fill="#6366f1"/><rect x="13" y="1" width="10" height="10" rx="1" fill="#e5e7eb"/></svg>`,
  },
  {
    id: "hero-image-bg",
    label: "Hero Image BG",
    category: "Heroes",
    content: `<section class="relative bg-primary-dark py-32 px-6 text-center overflow-hidden">
  <img src="https://placehold.co/1920x800/1f2937/374151?text=Background" alt="" class="absolute inset-0 w-full h-full object-cover opacity-40" />
  <div class="relative max-w-4xl mx-auto">
    <h1 class="text-5xl md:text-7xl font-black text-on-primary mb-6">Bold Statement Here</h1>
    <p class="text-xl text-on-primary/80 mb-10 max-w-2xl mx-auto">A powerful subtitle on top of a beautiful background image.</p>
    <a href="#" class="inline-block px-10 py-4 bg-accent text-on-accent font-bold rounded-xl text-lg hover:opacity-90 transition">Get Started</a>
  </div>
</section>`,
    media: `<svg viewBox="0 0 24 12" fill="none"><rect width="24" height="12" rx="1" fill="#374151"/><rect x="6" y="2" width="12" height="2" rx=".5" fill="#fff"/><rect x="8" y="5" width="8" height="1" rx=".25" fill="#9ca3af"/><rect x="9" y="8" width="6" height="1.5" rx=".5" fill="#fff"/></svg>`,
  },
  // ─── Features ─────────────────────────────────────────
  {
    id: "features-grid",
    label: "Features Grid",
    category: "Features",
    content: `<section class="bg-surface py-20 px-6">
  <div class="max-w-6xl mx-auto">
    <h2 class="text-4xl font-black text-on-surface text-center mb-4">Features</h2>
    <p class="text-center text-on-surface/60 mb-12 max-w-2xl mx-auto">Everything you need to succeed.</p>
    <div class="grid md:grid-cols-3 gap-8">
      <div class="bg-primary/5 rounded-2xl p-8">
        <div class="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-on-primary text-xl mb-4">⚡</div>
        <h3 class="text-xl font-black text-on-surface mb-2">Lightning Fast</h3>
        <p class="text-on-surface/60">Built for speed from the ground up.</p>
      </div>
      <div class="bg-primary/5 rounded-2xl p-8">
        <div class="w-12 h-12 bg-secondary rounded-xl flex items-center justify-center text-on-secondary text-xl mb-4">🔒</div>
        <h3 class="text-xl font-black text-on-surface mb-2">Secure</h3>
        <p class="text-on-surface/60">Enterprise-grade security by default.</p>
      </div>
      <div class="bg-primary/5 rounded-2xl p-8">
        <div class="w-12 h-12 bg-accent rounded-xl flex items-center justify-center text-on-accent text-xl mb-4">🎨</div>
        <h3 class="text-xl font-black text-on-surface mb-2">Beautiful</h3>
        <p class="text-on-surface/60">Pixel-perfect designs that stand out.</p>
      </div>
    </div>
  </div>
</section>`,
    media: `<svg viewBox="0 0 24 12" fill="none"><rect width="24" height="12" rx="1" fill="#f3f4f6"/><rect x="1" y="1" width="6" height="4" rx=".5" fill="#e5e7eb"/><rect x="9" y="1" width="6" height="4" rx=".5" fill="#e5e7eb"/><rect x="17" y="1" width="6" height="4" rx=".5" fill="#e5e7eb"/></svg>`,
  },
  {
    id: "features-bento",
    label: "Bento Grid",
    category: "Features",
    content: `<section class="bg-surface py-20 px-6">
  <div class="max-w-6xl mx-auto">
    <h2 class="text-4xl font-black text-on-surface text-center mb-12">Why Choose Us</h2>
    <div class="grid md:grid-cols-3 gap-4">
      <div class="md:col-span-2 bg-primary rounded-2xl p-10 text-on-primary">
        <h3 class="text-2xl font-black mb-3">All-in-one Platform</h3>
        <p class="text-on-primary/80">Everything you need under one roof. No more juggling between tools.</p>
      </div>
      <div class="bg-secondary rounded-2xl p-10 text-on-secondary">
        <h3 class="text-2xl font-black mb-3">Fast Setup</h3>
        <p class="text-on-secondary/80">Get started in under 5 minutes.</p>
      </div>
      <div class="bg-accent rounded-2xl p-10 text-on-accent">
        <h3 class="text-2xl font-black mb-3">24/7 Support</h3>
        <p class="text-on-accent/80">Always here when you need us.</p>
      </div>
      <div class="md:col-span-2 bg-on-surface/5 rounded-2xl p-10">
        <h3 class="text-2xl font-black text-on-surface mb-3">Analytics Dashboard</h3>
        <p class="text-on-surface/60">Track everything that matters with beautiful real-time charts.</p>
      </div>
    </div>
  </div>
</section>`,
    media: `<svg viewBox="0 0 24 12" fill="none"><rect width="24" height="12" rx="1" fill="#f3f4f6"/><rect x="1" y="1" width="14" height="4" rx=".5" fill="#6366f1"/><rect x="17" y="1" width="6" height="4" rx=".5" fill="#10b981"/><rect x="1" y="7" width="6" height="4" rx=".5" fill="#f59e0b"/><rect x="9" y="7" width="14" height="4" rx=".5" fill="#e5e7eb"/></svg>`,
  },
  // ─── Testimonials ─────────────────────────────────────
  {
    id: "testimonials-cards",
    label: "Testimonials",
    category: "Social Proof",
    content: `<section class="bg-surface py-20 px-6">
  <div class="max-w-6xl mx-auto">
    <h2 class="text-4xl font-black text-on-surface text-center mb-12">What People Say</h2>
    <div class="grid md:grid-cols-3 gap-8">
      <div class="bg-on-surface/5 rounded-2xl p-8">
        <p class="text-on-surface/80 mb-6">"This product changed how we work. Absolutely incredible results in just weeks."</p>
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-on-primary font-bold">A</div>
          <div><p class="font-bold text-on-surface text-sm">Alex Johnson</p><p class="text-xs text-on-surface/50">CEO, TechCo</p></div>
        </div>
      </div>
      <div class="bg-on-surface/5 rounded-2xl p-8">
        <p class="text-on-surface/80 mb-6">"The best tool I've used in my career. Support team is amazing."</p>
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-secondary rounded-full flex items-center justify-center text-on-secondary font-bold">M</div>
          <div><p class="font-bold text-on-surface text-sm">Maria Garcia</p><p class="text-xs text-on-surface/50">Designer, StudioX</p></div>
        </div>
      </div>
      <div class="bg-on-surface/5 rounded-2xl p-8">
        <p class="text-on-surface/80 mb-6">"10x improvement in productivity. I recommend it to everyone."</p>
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-accent rounded-full flex items-center justify-center text-on-accent font-bold">S</div>
          <div><p class="font-bold text-on-surface text-sm">Sam Lee</p><p class="text-xs text-on-surface/50">CTO, BuildIt</p></div>
        </div>
      </div>
    </div>
  </div>
</section>`,
    media: `<svg viewBox="0 0 24 12" fill="none"><rect width="24" height="12" rx="1" fill="#f3f4f6"/><rect x="1" y="1" width="6" height="10" rx=".5" fill="#e5e7eb"/><rect x="9" y="1" width="6" height="10" rx=".5" fill="#e5e7eb"/><rect x="17" y="1" width="6" height="10" rx=".5" fill="#e5e7eb"/></svg>`,
  },
  {
    id: "logo-cloud",
    label: "Logo Cloud",
    category: "Social Proof",
    content: `<section class="bg-surface py-16 px-6">
  <div class="max-w-4xl mx-auto text-center">
    <p class="text-sm font-bold text-on-surface/40 uppercase tracking-wider mb-8">Trusted by industry leaders</p>
    <div class="flex flex-wrap justify-center items-center gap-12 opacity-50">
      <span class="text-2xl font-black text-on-surface">Brand</span>
      <span class="text-2xl font-black text-on-surface">Company</span>
      <span class="text-2xl font-black text-on-surface">Startup</span>
      <span class="text-2xl font-black text-on-surface">Agency</span>
      <span class="text-2xl font-black text-on-surface">Studio</span>
    </div>
  </div>
</section>`,
    media: `<svg viewBox="0 0 24 12" fill="none"><rect width="24" height="12" rx="1" fill="#f3f4f6"/><rect x="2" y="5" width="4" height="2" rx=".5" fill="#d1d5db"/><rect x="8" y="5" width="4" height="2" rx=".5" fill="#d1d5db"/><rect x="14" y="5" width="4" height="2" rx=".5" fill="#d1d5db"/><rect x="20" y="5" width="3" height="2" rx=".5" fill="#d1d5db"/></svg>`,
  },
  // ─── Pricing ──────────────────────────────────────────
  {
    id: "pricing-cards",
    label: "Pricing Cards",
    category: "Pricing",
    content: `<section class="bg-surface py-20 px-6">
  <div class="max-w-5xl mx-auto">
    <h2 class="text-4xl font-black text-on-surface text-center mb-4">Pricing</h2>
    <p class="text-center text-on-surface/60 mb-12">Simple, transparent pricing.</p>
    <div class="grid md:grid-cols-3 gap-8">
      <div class="border-2 border-on-surface/10 rounded-2xl p-8 bg-surface">
        <h3 class="text-lg font-bold text-on-surface mb-2">Basic</h3>
        <div class="text-4xl font-black text-on-surface mb-6">$9<span class="text-lg font-normal text-on-surface/50">/mo</span></div>
        <ul class="space-y-3 text-on-surface/70 mb-8"><li>✓ 5 Projects</li><li>✓ Basic Support</li><li>✓ 1 GB Storage</li></ul>
        <a href="#" class="block text-center px-6 py-3 border-2 border-primary text-primary font-bold rounded-xl hover:bg-primary/5 transition">Choose Plan</a>
      </div>
      <div class="border-2 border-primary rounded-2xl p-8 bg-primary/5 relative">
        <span class="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-on-primary text-xs font-bold px-3 py-1 rounded-full">Popular</span>
        <h3 class="text-lg font-bold text-on-surface mb-2">Pro</h3>
        <div class="text-4xl font-black text-on-surface mb-6">$29<span class="text-lg font-normal text-on-surface/50">/mo</span></div>
        <ul class="space-y-3 text-on-surface/70 mb-8"><li>✓ Unlimited Projects</li><li>✓ Priority Support</li><li>✓ 50 GB Storage</li></ul>
        <a href="#" class="block text-center px-6 py-3 bg-primary text-on-primary font-bold rounded-xl hover:opacity-90 transition">Choose Plan</a>
      </div>
      <div class="border-2 border-on-surface/10 rounded-2xl p-8 bg-surface">
        <h3 class="text-lg font-bold text-on-surface mb-2">Enterprise</h3>
        <div class="text-4xl font-black text-on-surface mb-6">$99<span class="text-lg font-normal text-on-surface/50">/mo</span></div>
        <ul class="space-y-3 text-on-surface/70 mb-8"><li>✓ Everything in Pro</li><li>✓ Dedicated Support</li><li>✓ Unlimited Storage</li></ul>
        <a href="#" class="block text-center px-6 py-3 border-2 border-primary text-primary font-bold rounded-xl hover:bg-primary/5 transition">Contact Sales</a>
      </div>
    </div>
  </div>
</section>`,
    media: `<svg viewBox="0 0 24 12" fill="none"><rect width="24" height="12" rx="1" fill="#f3f4f6"/><rect x="1" y="1" width="6" height="10" rx=".5" fill="#e5e7eb"/><rect x="9" y="0" width="6" height="11" rx=".5" fill="#ddd6fe"/><rect x="17" y="1" width="6" height="10" rx=".5" fill="#e5e7eb"/></svg>`,
  },
  // ─── FAQ ──────────────────────────────────────────────
  {
    id: "faq-section",
    label: "FAQ",
    category: "Content",
    content: `<section class="bg-surface py-20 px-6">
  <div class="max-w-3xl mx-auto">
    <h2 class="text-4xl font-black text-on-surface text-center mb-12">Frequently Asked Questions</h2>
    <div class="space-y-6">
      <details class="bg-on-surface/5 rounded-xl p-6 group" open>
        <summary class="font-bold text-on-surface cursor-pointer list-none flex justify-between items-center">
          What is included in the free plan?
          <span class="text-on-surface/40 group-open:rotate-180 transition-transform">▼</span>
        </summary>
        <p class="text-on-surface/60 mt-4">The free plan includes up to 3 projects, basic analytics, and community support.</p>
      </details>
      <details class="bg-on-surface/5 rounded-xl p-6 group">
        <summary class="font-bold text-on-surface cursor-pointer list-none flex justify-between items-center">
          Can I upgrade at any time?
          <span class="text-on-surface/40 group-open:rotate-180 transition-transform">▼</span>
        </summary>
        <p class="text-on-surface/60 mt-4">Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately.</p>
      </details>
      <details class="bg-on-surface/5 rounded-xl p-6 group">
        <summary class="font-bold text-on-surface cursor-pointer list-none flex justify-between items-center">
          Do you offer refunds?
          <span class="text-on-surface/40 group-open:rotate-180 transition-transform">▼</span>
        </summary>
        <p class="text-on-surface/60 mt-4">We offer a 30-day money-back guarantee. No questions asked.</p>
      </details>
    </div>
  </div>
</section>`,
    media: `<svg viewBox="0 0 24 12" fill="none"><rect width="24" height="12" rx="1" fill="#f3f4f6"/><rect x="3" y="1" width="18" height="2.5" rx=".5" fill="#e5e7eb"/><rect x="3" y="5" width="18" height="2.5" rx=".5" fill="#e5e7eb"/><rect x="3" y="9" width="18" height="2.5" rx=".5" fill="#e5e7eb"/></svg>`,
  },
  // ─── Stats ────────────────────────────────────────────
  {
    id: "stats-section",
    label: "Stats",
    category: "Content",
    content: `<section class="bg-primary py-16 px-6">
  <div class="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
    <div><div class="text-4xl font-black text-on-primary">10K+</div><p class="text-on-primary/70 mt-1 text-sm">Customers</p></div>
    <div><div class="text-4xl font-black text-on-primary">99.9%</div><p class="text-on-primary/70 mt-1 text-sm">Uptime</p></div>
    <div><div class="text-4xl font-black text-on-primary">50M+</div><p class="text-on-primary/70 mt-1 text-sm">Requests/day</p></div>
    <div><div class="text-4xl font-black text-on-primary">150+</div><p class="text-on-primary/70 mt-1 text-sm">Countries</p></div>
  </div>
</section>`,
    media: `<svg viewBox="0 0 24 12" fill="none"><rect width="24" height="12" rx="1" fill="#6366f1"/><rect x="2" y="3" width="4" height="3" rx=".5" fill="#fff"/><rect x="8" y="3" width="4" height="3" rx=".5" fill="#fff"/><rect x="14" y="3" width="4" height="3" rx=".5" fill="#fff"/><rect x="20" y="3" width="3" height="3" rx=".5" fill="#fff"/></svg>`,
  },
  // ─── Team ─────────────────────────────────────────────
  {
    id: "team-section",
    label: "Team",
    category: "Content",
    content: `<section class="bg-surface py-20 px-6">
  <div class="max-w-5xl mx-auto">
    <h2 class="text-4xl font-black text-on-surface text-center mb-12">Our Team</h2>
    <div class="grid md:grid-cols-4 gap-8 text-center">
      <div>
        <img src="https://placehold.co/200x200/e2e8f0/64748b?text=Photo" alt="Team member" class="w-24 h-24 rounded-full mx-auto mb-4 object-cover" />
        <h3 class="font-bold text-on-surface">Jane Smith</h3>
        <p class="text-sm text-on-surface/50">CEO</p>
      </div>
      <div>
        <img src="https://placehold.co/200x200/e2e8f0/64748b?text=Photo" alt="Team member" class="w-24 h-24 rounded-full mx-auto mb-4 object-cover" />
        <h3 class="font-bold text-on-surface">John Doe</h3>
        <p class="text-sm text-on-surface/50">CTO</p>
      </div>
      <div>
        <img src="https://placehold.co/200x200/e2e8f0/64748b?text=Photo" alt="Team member" class="w-24 h-24 rounded-full mx-auto mb-4 object-cover" />
        <h3 class="font-bold text-on-surface">Lisa Park</h3>
        <p class="text-sm text-on-surface/50">Designer</p>
      </div>
      <div>
        <img src="https://placehold.co/200x200/e2e8f0/64748b?text=Photo" alt="Team member" class="w-24 h-24 rounded-full mx-auto mb-4 object-cover" />
        <h3 class="font-bold text-on-surface">Mike Chen</h3>
        <p class="text-sm text-on-surface/50">Engineer</p>
      </div>
    </div>
  </div>
</section>`,
    media: `<svg viewBox="0 0 24 12" fill="none"><rect width="24" height="12" rx="1" fill="#f3f4f6"/><circle cx="4" cy="5" r="2" fill="#d1d5db"/><circle cx="10" cy="5" r="2" fill="#d1d5db"/><circle cx="16" cy="5" r="2" fill="#d1d5db"/><circle cx="22" cy="5" r="2" fill="#d1d5db"/></svg>`,
  },
  // ─── CTA ──────────────────────────────────────────────
  {
    id: "cta-section",
    label: "Call to Action",
    category: "CTA",
    content: `<section class="bg-primary py-20 px-6">
  <div class="max-w-3xl mx-auto text-center">
    <h2 class="text-4xl font-black text-on-primary mb-4">Ready to get started?</h2>
    <p class="text-lg text-on-primary/80 mb-8">Join thousands of happy customers and start building today.</p>
    <a href="#" class="inline-block px-10 py-4 bg-accent text-on-accent font-bold rounded-xl text-lg hover:opacity-90 transition">Start Free Trial</a>
  </div>
</section>`,
    media: `<svg viewBox="0 0 24 12" fill="none"><rect width="24" height="12" rx="1" fill="#6366f1"/><rect x="6" y="3" width="12" height="2" rx=".5" fill="#fff"/><rect x="8" y="7" width="8" height="2" rx=".5" fill="#f59e0b"/></svg>`,
  },
  {
    id: "newsletter-section",
    label: "Newsletter",
    category: "CTA",
    content: `<section class="bg-on-surface/5 py-20 px-6">
  <div class="max-w-xl mx-auto text-center">
    <h2 class="text-3xl font-black text-on-surface mb-4">Stay Updated</h2>
    <p class="text-on-surface/60 mb-8">Get the latest news and updates straight to your inbox.</p>
    <form class="flex gap-3 max-w-md mx-auto">
      <input type="email" placeholder="your@email.com" class="flex-1 px-4 py-3 rounded-xl border-2 border-on-surface/20 bg-surface focus:border-primary focus:outline-none" />
      <button class="px-6 py-3 bg-primary text-on-primary font-bold rounded-xl hover:opacity-90 transition">Subscribe</button>
    </form>
  </div>
</section>`,
    media: `<svg viewBox="0 0 24 12" fill="none"><rect width="24" height="12" rx="1" fill="#f3f4f6"/><rect x="5" y="6" width="10" height="2.5" rx=".5" fill="#e5e7eb"/><rect x="16" y="6" width="4" height="2.5" rx=".5" fill="#6366f1"/></svg>`,
  },
  // ─── Footer ───────────────────────────────────────────
  {
    id: "footer",
    label: "Footer",
    category: "Footer",
    content: `<section class="bg-on-surface py-12 px-6">
  <div class="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
    <div class="text-surface font-black text-xl">YourBrand</div>
    <nav class="flex gap-6 text-surface/70 text-sm">
      <a href="#" class="hover:text-surface transition">About</a>
      <a href="#" class="hover:text-surface transition">Features</a>
      <a href="#" class="hover:text-surface transition">Pricing</a>
      <a href="#" class="hover:text-surface transition">Contact</a>
    </nav>
    <p class="text-surface/50 text-xs">© 2026 YourBrand. All rights reserved.</p>
  </div>
</section>`,
    media: `<svg viewBox="0 0 24 12" fill="none"><rect width="24" height="12" rx="1" fill="#1f2937"/><rect x="1" y="5" width="6" height="1" rx=".25" fill="#9ca3af"/><rect x="10" y="5" width="4" height="1" rx=".25" fill="#6b7280"/><rect x="16" y="5" width="4" height="1" rx=".25" fill="#6b7280"/></svg>`,
  },
  {
    id: "footer-columns",
    label: "Footer Columns",
    category: "Footer",
    content: `<section class="bg-on-surface py-16 px-6">
  <div class="max-w-6xl mx-auto grid md:grid-cols-4 gap-8">
    <div>
      <h4 class="text-surface font-black text-lg mb-4">YourBrand</h4>
      <p class="text-surface/50 text-sm">Building the future, one pixel at a time.</p>
    </div>
    <div>
      <h4 class="text-surface font-bold text-sm mb-4">Product</h4>
      <ul class="space-y-2 text-surface/60 text-sm"><li><a href="#" class="hover:text-surface transition">Features</a></li><li><a href="#" class="hover:text-surface transition">Pricing</a></li><li><a href="#" class="hover:text-surface transition">Changelog</a></li></ul>
    </div>
    <div>
      <h4 class="text-surface font-bold text-sm mb-4">Company</h4>
      <ul class="space-y-2 text-surface/60 text-sm"><li><a href="#" class="hover:text-surface transition">About</a></li><li><a href="#" class="hover:text-surface transition">Blog</a></li><li><a href="#" class="hover:text-surface transition">Careers</a></li></ul>
    </div>
    <div>
      <h4 class="text-surface font-bold text-sm mb-4">Legal</h4>
      <ul class="space-y-2 text-surface/60 text-sm"><li><a href="#" class="hover:text-surface transition">Privacy</a></li><li><a href="#" class="hover:text-surface transition">Terms</a></li></ul>
    </div>
  </div>
</section>`,
    media: `<svg viewBox="0 0 24 12" fill="none"><rect width="24" height="12" rx="1" fill="#1f2937"/><rect x="1" y="2" width="5" height="1" rx=".25" fill="#fff"/><rect x="8" y="2" width="4" height="1" rx=".25" fill="#9ca3af"/><rect x="8" y="4" width="3" height=".5" rx=".25" fill="#6b7280"/><rect x="8" y="5.5" width="3" height=".5" rx=".25" fill="#6b7280"/><rect x="14" y="2" width="4" height="1" rx=".25" fill="#9ca3af"/><rect x="20" y="2" width="3" height="1" rx=".25" fill="#9ca3af"/></svg>`,
  },
];
