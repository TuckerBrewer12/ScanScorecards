import { motion } from "framer-motion";

const TARGETS: { label: string; value: number | null }[] = [
  { label: "My Level",   value: null },
  { label: "Scratch",    value: 0    },
  { label: "Breaks 80",  value: 5    },
  { label: "Breaks 85",  value: 10   },
  { label: "Breaks 90",  value: 15   },
  { label: "Breaks 95",  value: 20   },
  { label: "Breaks 100", value: 25   },
];

interface ComparisonTargetToggleProps {
  value: number | null;
  onChange: (v: number | null) => void;
  vertical?: boolean;
}

export function ComparisonTargetToggle({ value, onChange, vertical = false }: ComparisonTargetToggleProps) {
  return (
    <div className={`bg-gray-100 rounded-xl p-0.5 gap-0.5 ${vertical ? "flex flex-col" : "inline-flex overflow-x-auto scrollbar-none w-full p-1 gap-1"}`}>
      {TARGETS.map((t) => {
        const active = t.value === value;
        return (
          <motion.button
            key={t.label}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onChange(t.value)}
            className={`rounded-lg text-xs transition-colors ${
              vertical ? "px-2.5 py-1.5 text-left" : "shrink-0 px-3 py-1"
            } ${
              active
                ? "bg-white shadow-sm text-gray-900 font-semibold"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </motion.button>
        );
      })}
    </div>
  );
}
