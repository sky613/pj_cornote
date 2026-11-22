import type { ButtonHTMLAttributes } from 'react'
import { buttonClass, type Size, type Variant } from './buttonClass'

export { buttonClass }

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export function Button({ variant = 'primary', size = 'md', className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />
}
