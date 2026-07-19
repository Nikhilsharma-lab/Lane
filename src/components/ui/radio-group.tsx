"use client"

import * as React from "react"
import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function RadioGroup<Value>({
  className,
  ...props
}: RadioGroupPrimitive.Props<Value>) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("flex flex-col", className)}
      {...props}
    />
  )
}

function RadioGroupItem<Value>({
  className,
  ...props
}: RadioPrimitive.Root.Props<Value>) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        "flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-muted-foreground bg-transparent text-transparent outline-none transition-colors data-checked:border-brand data-checked:bg-brand data-checked:text-brand-foreground data-disabled:cursor-not-allowed data-disabled:border-disabled-foreground data-disabled:bg-disabled data-disabled:text-disabled-foreground",
        className
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="flex items-center justify-center"
      >
        <CheckIcon aria-hidden="true" className="size-[11px]" strokeWidth={3} />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Root>
  )
}

export { RadioGroup, RadioGroupItem }
