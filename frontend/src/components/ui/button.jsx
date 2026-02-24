import * as React from "react"
import { cn } from "../lib/utils"

const Button = React.forwardRef(({ className, variant = "default", size = "default", ...props }, ref) => {
  const variants = {
    default: "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/20",
    outline: "border border-gray-700 bg-transparent hover:bg-gray-800 text-gray-300",
    ghost: "bg-transparent hover:bg-gray-800 text-gray-400 hover:text-white",
    secondary: "bg-gray-800 text-gray-100 hover:bg-gray-700",
    danger: "bg-red-600 text-white hover:bg-red-700",
  }

  const sizes = {
    default: "h-10 px-4 py-2",
    sm: "h-8 px-3 text-xs",
    lg: "h-12 px-8",
    icon: "h-10 w-10",
  }

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Button.displayName = "Button"

export { Button }
