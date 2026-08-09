import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-[#4a4a4a] bg-[#262626] p-0.5 shadow-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8D2A6]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-[#E8D2A6] data-[state=checked]:bg-[#E8D2A6] data-[state=unchecked]:border-[#4a4a4a] data-[state=unchecked]:bg-[#262626]",
      className
    )}
    {...props}
    ref={ref}>
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-md ring-0 transition-all duration-200 data-[state=checked]:translate-x-5 data-[state=checked]:bg-black data-[state=unchecked]:translate-x-0 data-[state=unchecked]:bg-white"
      )} />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
