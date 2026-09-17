// Tremor Tracker [v1.0.0]
//
// Ported from https://github.com/tremorlabs/tremor (Apache-2.0)
// File upstream: src/components/Tracker/Tracker.tsx
// Sem alterações estruturais: usa @radix-ui/react-hover-card (já instalado no
// Tieck) para o tooltip por bloco.

import React from "react";
import * as HoverCardPrimitives from "@radix-ui/react-hover-card";

import { cx } from "../utils/cx";

interface TrackerBlockProps {
  key?: string | number;
  color?: string;
  tooltip?: string;
  hoverEffect?: boolean;
  defaultBackgroundColor?: string;
}

const Block = ({ color, tooltip, defaultBackgroundColor, hoverEffect }: TrackerBlockProps) => {
  const [open, setOpen] = React.useState(false);
  return (
    <HoverCardPrimitives.Root open={open} onOpenChange={setOpen} openDelay={0} closeDelay={0}>
      <HoverCardPrimitives.Trigger onClick={() => setOpen(true)} asChild>
        <div className="size-full overflow-hidden px-[0.5px] transition first:rounded-l-[4px] first:pl-0 last:rounded-r-[4px] last:pr-0 sm:px-px">
          <div
            className={cx(
              "size-full rounded-[1px]",
              color || defaultBackgroundColor,
              hoverEffect ? "hover:opacity-50" : "",
            )}
          />
        </div>
      </HoverCardPrimitives.Trigger>
      <HoverCardPrimitives.Portal>
        <HoverCardPrimitives.Content
          sideOffset={10}
          side="top"
          align="center"
          avoidCollisions
          className="w-auto rounded-md bg-neutral-900 px-2 py-1 text-sm text-white shadow-md"
        >
          {tooltip}
        </HoverCardPrimitives.Content>
      </HoverCardPrimitives.Portal>
    </HoverCardPrimitives.Root>
  );
};

Block.displayName = "Block";

interface TrackerProps extends React.HTMLAttributes<HTMLDivElement> {
  data: TrackerBlockProps[];
  defaultBackgroundColor?: string;
  hoverEffect?: boolean;
}

const Tracker = React.forwardRef<HTMLDivElement, TrackerProps>(
  (
    { data = [], defaultBackgroundColor = "bg-neutral-300", className, hoverEffect, ...props },
    forwardedRef,
  ) => {
    return (
      <div
        ref={forwardedRef}
        className={cx("group flex h-8 w-full items-center", className)}
        tremor-id="tremor-raw"
        {...props}
      >
        {data.map((blockProps, index) => (
          <Block
            key={blockProps.key ?? index}
            defaultBackgroundColor={defaultBackgroundColor}
            hoverEffect={hoverEffect}
            {...blockProps}
          />
        ))}
      </div>
    );
  },
);

Tracker.displayName = "Tracker";

export { Tracker, type TrackerBlockProps };
