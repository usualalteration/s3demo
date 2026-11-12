import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Generic shadcn-style input primitive. Id and name are always passed
 * through to the underlying element; callers provide stable identifiers.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return React.createElement("input", {
      type,
      className: cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      ),
      ref,
      ...props,
    });
  },
);
Input.displayName = "Input";

export { Input };
