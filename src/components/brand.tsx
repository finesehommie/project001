import { Link } from '@tanstack/react-router';
import { useSiteName } from '@/hooks/use-site-name';
import logo from '@/assets/sosderiv-logo-small.png';

export function Brand() {
  const name = useSiteName();
  return (
    <Link to="/" className="brand" aria-label={`${name} home`}>
      <img className="brand-logo" src={logo} alt="" width={40} height={40} />
      <span className="brand-type">{name}</span>
    </Link>
  );
}
