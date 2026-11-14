import { Module } from '@nestjs/common';
import { INPUT_CHECKS, type InputCheck } from './guardrail.types.js';
import { LengthCheck } from './input-checks/length.check.js';
import { PromptInjectionCheck } from './input-checks/prompt-injection.check.js';
import { SanitizeCheck } from './input-checks/sanitize.check.js';
import { SpamCheck } from './input-checks/spam.check.js';
import { InputGuardService } from './input.guard.js';
import { OutputGuardService } from './output.guard.js';

@Module({
  providers: [
    {
      // Order matters: sanitize first so later checks see clean text
      provide: INPUT_CHECKS,
      useFactory: (): InputCheck[] => [
        new SanitizeCheck(),
        new LengthCheck(),
        new SpamCheck(),
        new PromptInjectionCheck(),
      ],
    },
    InputGuardService,
    OutputGuardService,
  ],
  exports: [InputGuardService, OutputGuardService],
})
export class GuardrailsModule {}
