import { describe, it, expect } from 'vitest';
import type {
  CustomLiquidTag,
  CustomLiquidFilter,
  FilterParameter,
} from '../../types/liquid-registry';

describe('Custom Liquid Registry Types', () => {
  describe('CustomLiquidTag', () => {
    it('should have correct fields', () => {
      const tag: CustomLiquidTag = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        name: 'custom_banner',
        signature: '{% custom_banner title: string, image: string %}',
        description: 'A custom banner tag',
        createdAt: '2026-02-07T00:00:00Z',
        updatedAt: '2026-02-07T00:00:00Z',
      };

      expect(tag.id).toBeDefined();
      expect(tag.projectId).toBeDefined();
      expect(tag.name).toBeDefined();
      expect(tag.signature).toBeDefined();
      expect(tag.description).toBeDefined();
      expect(tag.createdAt).toBeDefined();
      expect(tag.updatedAt).toBeDefined();
    });

    it('should allow null description', () => {
      const tag: CustomLiquidTag = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        name: 'custom_banner',
        signature: '{% custom_banner title: string, image: string %}',
        description: null,
        createdAt: '2026-02-07T00:00:00Z',
        updatedAt: '2026-02-07T00:00:00Z',
      };

      expect(tag.description).toBeNull();
    });
  });

  describe('CustomLiquidFilter', () => {
    it('should have correct fields with parameters', () => {
      const parameters: FilterParameter[] = [
        {
          name: 'prefix',
          type: 'string',
          required: false,
        },
        {
          name: 'suffix',
          type: 'string',
          required: true,
        },
      ];

      const filter: CustomLiquidFilter = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        name: 'custom_format',
        inputType: 'string',
        outputType: 'string',
        parameters,
        description: 'A custom formatting filter',
        createdAt: '2026-02-07T00:00:00Z',
        updatedAt: '2026-02-07T00:00:00Z',
      };

      expect(filter.id).toBeDefined();
      expect(filter.projectId).toBeDefined();
      expect(filter.name).toBeDefined();
      expect(filter.inputType).toBeDefined();
      expect(filter.outputType).toBeDefined();
      expect(filter.parameters).toBeDefined();
      expect(filter.parameters).toHaveLength(2);
      expect(filter.description).toBeDefined();
      expect(filter.createdAt).toBeDefined();
      expect(filter.updatedAt).toBeDefined();
    });

    it('should allow null description', () => {
      const filter: CustomLiquidFilter = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        name: 'custom_format',
        inputType: 'any',
        outputType: 'string',
        parameters: [],
        description: null,
        createdAt: '2026-02-07T00:00:00Z',
        updatedAt: '2026-02-07T00:00:00Z',
      };

      expect(filter.description).toBeNull();
      expect(filter.parameters).toEqual([]);
    });
  });

  describe('FilterParameter', () => {
    it('should have correct fields', () => {
      const param: FilterParameter = {
        name: 'prefix',
        type: 'string',
        required: true,
      };

      expect(param.name).toBeDefined();
      expect(param.type).toBeDefined();
      expect(param.required).toBeDefined();
    });

    it('should support all parameter types', () => {
      const stringParam: FilterParameter = {
        name: 'text',
        type: 'string',
        required: false,
      };
      expect(stringParam.type).toBe('string');

      const numberParam: FilterParameter = {
        name: 'count',
        type: 'number',
        required: false,
      };
      expect(numberParam.type).toBe('number');

      const booleanParam: FilterParameter = {
        name: 'enabled',
        type: 'boolean',
        required: false,
      };
      expect(booleanParam.type).toBe('boolean');

      const arrayParam: FilterParameter = {
        name: 'items',
        type: 'array',
        required: false,
      };
      expect(arrayParam.type).toBe('array');

      const anyParam: FilterParameter = {
        name: 'value',
        type: 'any',
        required: false,
      };
      expect(anyParam.type).toBe('any');
    });

    it('should support required and optional parameters', () => {
      const requiredParam: FilterParameter = {
        name: 'required_field',
        type: 'string',
        required: true,
      };
      expect(requiredParam.required).toBe(true);

      const optionalParam: FilterParameter = {
        name: 'optional_field',
        type: 'string',
        required: false,
      };
      expect(optionalParam.required).toBe(false);
    });
  });
});
