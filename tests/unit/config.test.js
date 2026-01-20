import { describe, it, expect } from 'vitest';
import {
  CFG,
  MODEL_OPTIONS,
  STORAGE_KEYS,
  DEFAULT_PRICING
} from '../../src/modules/config.js';

describe('Config', () => {
  describe('MODEL_OPTIONS', () => {
    it('should have gpt-4.1-nano-priority as default model in CFG', () => {
      expect(CFG.model).toBe('gpt-4.1-nano-priority');
    });

    it('should have 5 model options', () => {
      expect(Object.keys(MODEL_OPTIONS)).toHaveLength(5);
    });

    it('should have all required fields for each model', () => {
      const requiredFields = ['name', 'apiModel', 'description', 'inputPer1M', 'outputPer1M', 'recommended', 'priority'];

      for (const [modelId, model] of Object.entries(MODEL_OPTIONS)) {
        for (const field of requiredFields) {
          expect(model).toHaveProperty(field);
        }
      }
    });

    it('should have exactly one recommended model', () => {
      const recommendedModels = Object.values(MODEL_OPTIONS).filter(m => m.recommended);
      expect(recommendedModels).toHaveLength(1);
      expect(recommendedModels[0].name).toBe('GPT-4.1 Nano Priority');
    });

    it('should have gpt-5-nano as the cheapest model', () => {
      const cheapest = Object.values(MODEL_OPTIONS).reduce((min, m) =>
        m.inputPer1M < min.inputPer1M ? m : min
      );
      expect(cheapest.apiModel).toBe('gpt-5-nano');
    });

    it('should have gpt-5.2-priority as the most expensive model', () => {
      const mostExpensive = Object.values(MODEL_OPTIONS).reduce((max, m) =>
        m.outputPer1M > max.outputPer1M ? m : max
      );
      expect(mostExpensive.apiModel).toBe('gpt-5.2');
    });

    it('should have correct priority flags', () => {
      expect(MODEL_OPTIONS['gpt-5-nano'].priority).toBe(false);
      expect(MODEL_OPTIONS['gpt-5-mini'].priority).toBe(false);
      expect(MODEL_OPTIONS['gpt-4.1-nano-priority'].priority).toBe(true);
      expect(MODEL_OPTIONS['gpt-5-mini-priority'].priority).toBe(true);
      expect(MODEL_OPTIONS['gpt-5.2-priority'].priority).toBe(true);
    });

    it('should have apiModel that differs from modelId for priority models', () => {
      expect(MODEL_OPTIONS['gpt-5-mini-priority'].apiModel).toBe('gpt-5-mini');
      expect(MODEL_OPTIONS['gpt-4.1-nano-priority'].apiModel).toBe('gpt-4.1-nano');
    });

    it('should have default model as a priority model for fast processing', () => {
      expect(MODEL_OPTIONS[CFG.model].priority).toBe(true);
    });
  });

  describe('STORAGE_KEYS', () => {
    it('should have MODEL storage key', () => {
      expect(STORAGE_KEYS.MODEL).toBe('neutralizer_model_v1');
    });
  });

  describe('DEFAULT_PRICING', () => {
    it('should use GPT-4.1 Nano Priority pricing by default', () => {
      expect(DEFAULT_PRICING.model).toBe('GPT-4.1 Nano Priority');
      expect(DEFAULT_PRICING.inputPer1M).toBe(0.20);
      expect(DEFAULT_PRICING.outputPer1M).toBe(0.80);
    });
  });
});
