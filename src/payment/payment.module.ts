import { DynamicModule, Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { paymentSettings, stripeSettings } from '../config/env';
import { FakePayController } from './fake/fake-pay.controller';
import { FAKE_PAY_ENTITIES } from './fake/fake-pay.entity';
import { FakePayService } from './fake/fake-pay.service';
import { FakeProvider } from './fake/fake.provider';
import { PAYMENT_PROVIDER } from './payment-provider';
import { Payment, PaymentEventRecord } from './payment.entity';
import { StripeProvider } from './stripe.provider';

@Global()
@Module({})
export class PaymentModule {
  /**
   * Picks the provider from PAYMENT_PROVIDER. Called from AppModule after the
   * environment is loaded; the fake provider's routes exist only when it is
   * the one in use.
   */
  static forRoot(): DynamicModule {
    const entities = TypeOrmModule.forFeature([Payment, PaymentEventRecord]);

    if (paymentSettings().provider === 'stripe') {
      return {
        module: PaymentModule,
        imports: [entities],
        providers: [
          {
            provide: PAYMENT_PROVIDER,
            useFactory: () => {
              const { secretKey, webhookSecret } = stripeSettings();
              return new StripeProvider(secretKey, webhookSecret);
            },
          },
        ],
        exports: [PAYMENT_PROVIDER, entities],
      };
    }

    return {
      module: PaymentModule,
      imports: [entities, TypeOrmModule.forFeature(FAKE_PAY_ENTITIES)],
      controllers: [FakePayController],
      providers: [
        FakePayService,
        {
          provide: PAYMENT_PROVIDER,
          useFactory: (fakePay: FakePayService) => new FakeProvider(fakePay),
          inject: [FakePayService],
        },
      ],
      exports: [PAYMENT_PROVIDER, FakePayService, entities],
    };
  }
}
