// Map InventoryItem.form → a lucide icon. Keeps the visual language
// consistent across Today, Inventory, Protocols, Insights.

import {
  Beaker,
  Droplet,
  Pill as PillIcon,
  Package,
  SprayCan,
  Wind,
  Box,
  type LucideIcon,
} from 'lucide-react';
import type { InventoryItem } from '@/db';
import { IconBadge } from './ui';

const FORM_TO_ICON: Record<InventoryItem['form'], LucideIcon> = {
  injectable_lyophilized: Beaker,
  injectable_solution: Beaker,
  capsule: PillIcon,
  tablet: PillIcon,
  powder_oral: Package,
  spray_nasal: SprayCan,
  spray_oral: SprayCan,
  drops_oral: Droplet,
  drops_eye: Droplet,
  topical_cream: Wind,
  topical_patch: Wind,
  supply: Box,
};

const FORM_TO_TONE: Record<InventoryItem['form'], 'primary' | 'pink' | 'cyan' | 'success' | 'warn' | 'neutral'> = {
  injectable_lyophilized: 'primary',
  injectable_solution: 'primary',
  capsule: 'cyan',
  tablet: 'cyan',
  powder_oral: 'cyan',
  spray_nasal: 'pink',
  spray_oral: 'pink',
  drops_oral: 'success',
  drops_eye: 'success',
  topical_cream: 'warn',
  topical_patch: 'warn',
  supply: 'neutral',
};

interface Props {
  form: InventoryItem['form'];
  size?: 'sm' | 'md';
  className?: string;
}

export function ProductIcon({ form, size = 'md', className }: Props) {
  const Icon = FORM_TO_ICON[form];
  const tone = FORM_TO_TONE[form];
  return (
    <IconBadge tone={tone} size={size} {...(className ? { className } : {})}>
      <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden />
    </IconBadge>
  );
}
