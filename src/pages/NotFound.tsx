import { useLocation } from "react-router-dom";
import { Link } from "react-router-dom";

const NotFound = () => {
  const location = useLocation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-ivory">
      <div className="text-center">
        <p className="text-7xl font-bold tracking-tight text-crimson">404</p>
        <p className="mt-4 text-xl font-semibold text-charcoal">Oops! Page not found</p>
        <p className="mt-1 text-sm text-mutedink">
          The route <span className="font-mono">{location.pathname}</span> does not exist.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-crimson px-5 text-sm font-semibold text-white transition-base hover:bg-crimson-dark"
        >
          Return to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
