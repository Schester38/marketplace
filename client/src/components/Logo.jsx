export default function Logo({ className = "logo-inline", alt = "MboppiShop", ...rest }) {
  return <img src="/navbar-logo.png" className={className} alt={alt} {...rest} />;
}
