import * as React from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Play, Square } from "lucide-react"

function SplitButton({
  className,
  children,
  onClick,
  onTogglePlay,
  isPlaying = false,
  disabled = false,
  playDisabled = false,
  ...props
}) {
  return (
    <div className={cn("flex", className)}>
      {/* Main button (left side) */}
      <Button
        onClick={onClick}
        disabled={disabled || isPlaying}
        className="rounded-r-none border-r-0 flex-1"
        {...props}
      >
        {children}
      </Button>
      
      {/* Play/Stop button (right side) */}
      <Button
        onClick={onTogglePlay}
        disabled={playDisabled}
        variant={isPlaying ? "destructive" : "default"}
        className="rounded-l-none px-3 min-w-0"
        {...props}
      >
        {isPlaying ? (
          <Square className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>
    </div>
  )
}

export { SplitButton }
