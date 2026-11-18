import { describe, expect, it } from 'vitest';
import { sessionStorage } from './sessionStorage';

const USER = { id: 'u1', email: 'jane@example.com' };

describe('sessionStorage', () => {
  it('round-trips the token and the user', () => {
    sessionStorage.saveToken('jwt');
    sessionStorage.saveUser(USER);
    expect(sessionStorage.token()).toBe('jwt');
    expect(sessionStorage.user()).toEqual(USER);
  });

  it('only returns the user while a token is present', () => {
    sessionStorage.saveUser(USER);
    expect(sessionStorage.user()).toBeNull();
  });

  it('treats a corrupt or malformed entry as absent', () => {
    sessionStorage.saveToken('jwt');
    localStorage.setItem('remittance_user', '{not json');
    expect(sessionStorage.user()).toBeNull();
    localStorage.setItem('remittance_user', JSON.stringify({ email: 'no-id' }));
    expect(sessionStorage.user()).toBeNull();
  });

  it('clear removes both keys', () => {
    sessionStorage.saveToken('jwt');
    sessionStorage.saveUser(USER);
    sessionStorage.clear();
    expect(sessionStorage.token()).toBeNull();
    expect(localStorage.getItem('remittance_user')).toBeNull();
  });
});
