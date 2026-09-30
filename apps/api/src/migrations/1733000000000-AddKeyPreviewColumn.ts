import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddKeyPreviewColumn1733000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'api_keys',
      new TableColumn({
        name: 'key_preview',
        type: 'varchar',
        isNullable: true,
        comment: 'Precomputed mask (first8...last4) to avoid decryption on list operations',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('api_keys', 'key_preview');
  }
}
