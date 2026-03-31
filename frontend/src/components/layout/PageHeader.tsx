import { useScroll, useTransform, motion } from "framer-motion";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  const { scrollY } = useScroll();

  const bgColor = useTransform(
    scrollY,
    [0, 40],
    ["rgba(248,250,248,0)", "rgba(248,250,248,0.92)"],
  );
  const borderColor = useTransform(
    scrollY,
    [0, 40],
    ["rgba(241,245,249,0)", "rgba(241,245,249,1)"],
  );
  const boxShadow = useTransform(
    scrollY,
    [0, 40],
    ["0 1px 0 rgba(0,0,0,0)", "0 1px 0 rgba(0,0,0,0.05)"],
  );

  return (
    <motion.header
      className="fixed top-0 left-0 md:left-64 right-0 z-40 flex items-center px-4 md:px-8 py-3"
      style={{
        backgroundColor: bgColor,
        borderBottomWidth: 1,
        borderBottomStyle: "solid",
        borderBottomColor: borderColor,
        boxShadow,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      <div className="flex items-baseline gap-3 min-w-0">
        <h1 className="text-lg font-bold tracking-tight text-gray-900 whitespace-nowrap">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-gray-400 truncate">{subtitle}</p>
        )}
      </div>
    </motion.header>
  );
}
