import { LiquidValidator } from './validator';

const validator = new LiquidValidator();

export function validateShopifyTemplate(template: string) {
  return validator.validate(template);
}
