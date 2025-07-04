import * as React from "react"
import { cn } from "@/lib/utils"

function DualProgress({
  className,
  suggestedValue = 0,
  acceptedValue = 0,
  ...props
}) {
  return (
    <div
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-gray-200",
        className
      )}
      {...props}
    >
      {/* Blue bar for suggested (background layer) */}
      <div
        className="absolute top-0 left-0 h-full bg-blue-500 transition-all duration-300"
        style={{ width: `${Math.min(suggestedValue || 0, 100)}%` }}
      />
      {/* Green bar for accepted (foreground layer) */}
      <div
        className="absolute top-0 left-0 h-full bg-green-500 transition-all duration-300"
        style={{ width: `${Math.min(acceptedValue || 0, 100)}%` }}
      />
    </div>
  )
}

export { DualProgress }
