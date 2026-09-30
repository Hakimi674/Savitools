import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { IsInt, IsString } from 'class-validator';
import { VALIDATION_PIPE_OPTIONS } from './config/validation-pipe.config';

class SampleDto {
  @IsString()
  name!: string;

  @IsInt()
  limit!: number;
}

describe('ValidationPipe behaviour', () => {
  const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);

  it('rejects a body that carries properties the DTO does not declare', async () => {
    await expect(
      pipe.transform(
        { name: 'ok', limit: 1, unexpected: true },
        { type: 'body', metatype: SampleDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('strips nothing it should keep and coerces query primitives', async () => {
    const value = await pipe.transform(
      { name: 'ok', limit: '5' },
      { type: 'query', metatype: SampleDto },
    );

    expect(value).toBeInstanceOf(SampleDto);
    expect(value.name).toBe('ok');
    expect(value.limit).toBe(5);
  });

  it('rejects a value that fails a DTO validator with a 400', async () => {
    await expect(
      pipe.transform(
        { name: 'ok', limit: 'not-a-number' },
        { type: 'query', metatype: SampleDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('leaves a native query type alone (nothing to validate)', async () => {
    await expect(pipe.transform('plain', { type: 'query', metatype: String })).resolves.toBe(
      'plain',
    );
  });
});
