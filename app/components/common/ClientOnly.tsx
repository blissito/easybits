// components/ClientOnly.js
import { lazy, Suspense, useEffect, useState } from "react";
import PropTypes from "prop-types";

const ClientOnly = ({ load, fallback = null, ...props }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return fallback;

  const Component = lazy(load);
  return (
    <Suspense fallback={fallback}>
      <Component {...props} />
    </Suspense>
  );
};

ClientOnly.propTypes = {
  load: PropTypes.func.isRequired,
  fallback: PropTypes.node,
};

export default ClientOnly;
