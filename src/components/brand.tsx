import { Link } from '@tanstack/react-router';
import { ChartNoAxesCombined } from 'lucide-react';
import { useSiteName } from '@/hooks/use-site-name';

export function Brand() {
  const name = useSiteName();
  return (
    <Link to="/" className="brand" aria-label={`${name} home`}>
      <ChartNoAxesCombined className="brand-logo" aria-hidden="true" />
      <span className="brand-type">{name}</span>
    </Link>
  );
}
