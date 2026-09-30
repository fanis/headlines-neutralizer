import { describe, it, expect } from 'vitest';
import {
  CFG,
  DEFAULT_MODEL,
  MODEL_OPTIONS,
  REASONING_EFFORTS,
  STORAGE_KEYS,
  DEFAULT_PRICING
} from '../../src/modules/config.js';

describe('Config', () => {
  describe('MODEL_OPTIONS', () => {
    it('should have gpt-6-luna-priority as default model in CFG', () => {
      expect(DEFAULT_MODEL).toBe('gpt-6-luna-priority');
      expect(CFG.model).toBe(DEFAULT_MODEL);
    });

    it('should have 3 model options', () => {
      expect(Object.keys(MODEL_OPTIONS)).toHaveLength(3);
    });

    it('should have all required fields for each model', () => {
      const requiredFields = ['name', 'apiModel', 'description', 'inputPer1M', 'outputPer1M', 'recommended', 'priority', 'reasoning'];

      for (const [modelId, model] of Object.entries(MODEL_OPTIONS)) {
        for (const field of requiredFields) {
          expect(model).toHaveProperty(field);
        }
      }
    });

    it('should have exactly one recommended model', () => {
      const recommendedModels = Object.values(MODEL_OPTIONS).filter(m => m.recommended);
      expect(recommendedModels).toHaveLength(1);
      expect(recommendedModels[0].name).toBe('GPT-6 Luna Fast');
    });

    it('should have gpt-6-luna standard tier as the cheapest model', () => {
      const cheapest = Object.values(MODEL_OPTIONS).reduce((min, m) =>
        m.inputPer1M < min.inputPer1M ? m : min
      );
      expect(cheapest.apiModel).toBe('gpt-6-luna');
      expect(cheapest.priority).toBe(false);
    });

    it('should have gpt-6.1-sol-priority as the most expensive model', () => {
      const mostExpensive = Object.values(MODEL_OPTIONS).reduce((max, m) =>
        m.outputPer1M > max.outputPer1M ? m : max
      );
      expect(mostExpensive.apiModel).toBe('gpt-6.1-sol');
    });

    it('should have correct priority flags', () => {
      expect(MODEL_OPTIONS['gpt-6-luna-priority'].priority).toBe(true);
      expect(MODEL_OPTIONS['gpt-6-luna'].priority).toBe(false);
      expect(MODEL_OPTIONS['gpt-6.1-sol-priority'].priority).toBe(true);
    });

    it('should have apiModel that differs from modelId for priority models', () => {
      expect(MODEL_OPTIONS['gpt-6-luna-priority'].apiModel).toBe('gpt-6-luna');
      expect(MODEL_OPTIONS['gpt-6.1-sol-priority'].apiModel).toBe('gpt-6.1-sol');
    });

    it('should give every model a supported reasoning effort (GPT-6 models reject minimal)', () => {
      for (const [modelId, model] of Object.entries(MODEL_OPTIONS)) {
        expect(REASONING_EFFORTS, modelId).toContain(model.reasoning);
        expect(model.reasoning, modelId).not.toBe('minimal');
      }
    });

    it('should not use effort none for GPT-6.1 Sol (the API rejects it)', () => {
      expect(MODEL_OPTIONS['gpt-6.1-sol-priority'].reasoning).toBe('low');
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
    it('should use GPT-6 Luna Fast pricing by default', () => {
      expect(DEFAULT_PRICING.model).toBe('GPT-6 Luna Fast');
      expect(DEFAULT_PRICING.inputPer1M).toBe(0.20);
      expect(DEFAULT_PRICING.outputPer1M).toBe(1.00);
    });
  });
});
