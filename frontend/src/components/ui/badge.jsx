import * as React from "react"
import { cn } from "../lib/utils"

function Badge({ className, variant = "default", ...props }) {
  const variants = {
    default: "border-transparent bg-blue-600 text-white hover:bg-blue-600/80",
    secondary: "border-transparent bg-gray-800 text-gray-100 hover:bg-gray-800/80",
    destructive: "border-transparent bg-red-600 text-white hover:bg-red-600/80",
    outline: "text-gray-400 border-gray-700",
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        variants[variant],
        className
      )}
      {...props}
    />
  )
}

export { Badge }
