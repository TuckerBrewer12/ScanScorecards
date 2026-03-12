interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <div className="mb-8 border-b border-gray-100 pb-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">{title}</h1>
      {subtitle && <p className="text-sm text-gray-500 mt-1.5">{subtitle}</p>}
    </div>
  );
}
