declare module 'bcryptjs' {
  export function hash(value: string, saltRounds: number): Promise<string>;
  export function compare(value: string, encryptedValue: string): Promise<boolean>;

  const bcrypt: {
    hash: typeof hash;
    compare: typeof compare;
  };

  export default bcrypt;
}
