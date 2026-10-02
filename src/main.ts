import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ErrorsFilter } from './common/errors.filter';
import { validationPipe } from './common/validation';
import { corsOrigins } from './config/env';

async function bootstrap() {
  // rawBody: the payment webhook checks its signature against the bytes as sent.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api');
  app.enableCors({ origin: corsOrigins() });
  app.useGlobalPipes(validationPipe());
  app.useGlobalFilters(new ErrorsFilter());

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Conduit API')
      .setDescription(
        'The RealWorld API spec, plus roles, moderation, paid memberships and tips.',
      )
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 4000);
}

void bootstrap();
