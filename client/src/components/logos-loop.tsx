import {
  siAstro,
  siFramer,
  siGsap,
  siNextdotjs,
  siNodedotjs,
  siReact,
  siSvelte,
  siTailwindcss,
  siTypescript,
  siVite,
  siVuedotjs,
  siWebflow,
  type SimpleIcon,
} from "simple-icons";

interface Tool {
  name: string;
  icon: SimpleIcon;
}

const TOOLS: readonly Tool[] = [
  { name: "React", icon: siReact },
  { name: "Next.js", icon: siNextdotjs },
  { name: "Vue.js", icon: siVuedotjs },
  { name: "Svelte", icon: siSvelte },
  { name: "Astro", icon: siAstro },
  { name: "Tailwind CSS", icon: siTailwindcss },
  { name: "GSAP", icon: siGsap },
  { name: "Framer", icon: siFramer },
  { name: "Webflow", icon: siWebflow },
  { name: "TypeScript", icon: siTypescript },
  { name: "Node.js", icon: siNodedotjs },
  { name: "Vite", icon: siVite },
];

const TRACK = [...TOOLS, ...TOOLS];

function LogoItem({ name, icon }: Tool) {
  return (
    <div
      className="flex flex-shrink-0 items-center gap-3 px-10 opacity-60 grayscale transition-opacity duration-300 hover:opacity-100"
      title={name}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        className="h-8 w-8 object-contain md:h-9 md:w-9"
      >
        <path d={icon.path} fill="currentColor" />
      </svg>
      <span className="whitespace-nowrap text-sm font-medium tracking-wide text-black md:text-base">
        {name}
      </span>
    </div>
  );
}

export default function LogoMarquee() {
  return (
    <div className="w-full bg-background py-8">
      <div className="relative w-full overflow-hidden">
        {/* Fade edges so logos don't pop in/out abruptly */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent md:w-32" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background to-transparent md:w-32" />

        <div className="flex w-max animate-marquee">
          {TRACK.map((tool, i) => (
            <LogoItem key={`${tool.icon.slug}-${i}`} name={tool.name} icon={tool.icon} />
          ))}
        </div>
      </div>

      {/* Scoped keyframes: slow, linear, infinite, seamless loop */}
      <style>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 40s linear infinite;
        }
        .animate-marquee:hover {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-marquee {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
