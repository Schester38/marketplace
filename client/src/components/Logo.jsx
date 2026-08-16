export default function Logo({ className = 'logo-inline', alt = 'Mboppi', ...rest }) {
  return <img src="/navbar-logo.png" className={className} alt={alt} {...rest} />;
}