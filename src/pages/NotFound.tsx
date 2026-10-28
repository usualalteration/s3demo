import { Link, useLocation } from "react-router-dom";

const NotFound = () => {
  const location = useLocation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <p className="font-mono-tech text-sm text-muted-foreground">s3-studio/404</p>
        <h1 className="mb-2 mt-2 text-4xl font-bold tracking-tight">Page not found</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          The route <code className="font-mono-tech rounded bg-stone-100 px-1.5 py-0.5">{location.pathname}</code>{" "}
          does not exist.
        </p>
        <Link
          to="/storage"
          className="rounded-md bg-studio-crimson px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-studio-crimson-dark"
        >
          Back to My Storage
        </Link>
      </div>
    </div>
  );
};

export default NotFound;