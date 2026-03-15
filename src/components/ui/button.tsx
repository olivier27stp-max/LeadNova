import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-white shadow-sm hover:bg-primary-hover active:brightness-95",
        secondary:
          "bg-background-subtle text-foreground-secondary border border-border shadow-xs hover:bg-background-muted active:bg-background-muted",
        ghost:
          "text-foreground-secondary hover:bg-background-subtle hover:text-foreground active:bg-background-muted",
        danger:
          "bg-danger text-white shadow-sm hover:bg-danger/90 active:brightness-95",
        "danger-ghost":
          "text-danger hover:bg-danger-subtle active:bg-danger-subtle",
        link: "text-primary underline-offset-4 hover:underline p-0 h-auto",
        success:
          "bg-success text-white shadow-sm hover:bg-success/90 active:brightness-95",
      },
      size: {
        sm: "h-8 rounded-md px-3 text-xs",
        md: "h-9 rounded-md px-4 text-sm",
        lg: "h-10 rounded-md px-5 text-sm",
        icon: "h-9 w-9 rounded-md",
        "icon-sm": "h-8 w-8 rounded-md",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
