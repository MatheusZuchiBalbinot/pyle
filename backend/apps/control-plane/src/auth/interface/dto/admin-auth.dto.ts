import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

// Long enough to matter, bounded so a megabyte of "password" never
// reaches the KDF.
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 256;
const MAX_EMAIL_LENGTH = 320;

export class LoginDto {
	@IsEmail()
	@MaxLength(MAX_EMAIL_LENGTH)
	email!: string;

	@IsString()
	@MinLength(1)
	@MaxLength(MAX_PASSWORD_LENGTH)
	password!: string;
}

export { MIN_PASSWORD_LENGTH };
