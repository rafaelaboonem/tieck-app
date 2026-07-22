import React, { useRef, useEffect, forwardRef, useImperativeHandle } from "react";

interface EditableBlockProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

export const EditableBlock = forwardRef<HTMLDivElement, EditableBlockProps>(
  ({ value, onChange, onKeyDown, ...props }, ref) => {
    const innerRef = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => innerRef.current!);

    useEffect(() => {
      if (innerRef.current && innerRef.current.innerHTML !== value) {
        innerRef.current.innerHTML = value || "";
      }
    }, [value]);

    return (
      <div
        ref={innerRef}
        contentEditable
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        onKeyDown={onKeyDown}
        {...props}
      />
    );
  }
);

EditableBlock.displayName = "EditableBlock";