import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PdfDocument,
  Md5,
  Sha256,
  Rc4,
  Aes,
  PdfPermissions,
  PdfPermissionFlags,
  PdfSecurityHandler,
  PdfDigitalSignature
} from '../../src/index.js';

describe('PDF Security, Encryption & Digital Signatures (Phase 15)', () => {

  describe('Cryptographic Primitives (Pure JavaScript)', () => {
    it('should compute correct MD5 hashes against known test vectors', () => {
      // RFC 1321 test vectors
      assert.equal(Md5.hex(''), 'd41d8cd98f00b204e9800998ecf8427e');
      assert.equal(Md5.hex('a'), '0cc175b9c0f1b6a831c399e269772661');
      assert.equal(Md5.hex('abc'), '900150983cd24fb0d6963f7d28e17f72');
      assert.equal(
        Md5.hex('The quick brown fox jumps over the lazy dog'),
        '9e107d9d372bb6826bd81d3542a419d6'
      );
    });

    it('should compute correct SHA-256 hashes against known test vectors', () => {
      // FIPS 180-4 test vectors
      assert.equal(
        Sha256.hex(''),
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      );
      assert.equal(
        Sha256.hex('abc'),
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
      );
      assert.equal(
        Sha256.hex('The quick brown fox jumps over the lazy dog'),
        'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592'
      );
    });

    it('should encrypt and decrypt correctly with RC4 stream cipher', () => {
      const key = new TextEncoder().encode('SecretKey123');
      const plaintext = new TextEncoder().encode('Top Secret PDF Payload for RC4 testing');

      const ciphertext = Rc4.process(key, plaintext);
      assert.notDeepEqual(ciphertext, plaintext);
      assert.equal(ciphertext.length, plaintext.length);

      const decrypted = Rc4.process(key, ciphertext);
      assert.deepEqual(decrypted, plaintext);
      assert.equal(new TextDecoder().decode(decrypted), 'Top Secret PDF Payload for RC4 testing');
    });

    it('should encrypt and decrypt correctly with AES in CBC mode with PKCS#7 padding', () => {
      const key128 = new Uint8Array([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]);
      const message = new TextEncoder().encode('Confidential financial statement data for AES-128 CBC verification.');

      const ciphertext = Aes.encryptCbc(key128, message);
      // Ciphertext length must be at least 16 (IV) + padded blocks (multiple of 16)
      assert.ok(ciphertext.length > message.length);
      assert.equal(ciphertext.length % 16, 0);

      const decrypted = Aes.decryptCbc(key128, ciphertext);
      assert.deepEqual(decrypted, message);
      assert.equal(new TextDecoder().decode(decrypted), 'Confidential financial statement data for AES-128 CBC verification.');
    });
  });

  describe('PdfPermissions', () => {
    it('should construct and parse 32-bit permission bitmasks', () => {
      const p = PdfPermissions.createPermissions({
        print: true,
        printHighQuality: true,
        copy: false,
        modify: false,
        fillForms: true
      });

      assert.equal(typeof p, 'number');

      const parsed = PdfPermissions.parsePermissions(p);
      assert.equal(parsed.print, true);
      assert.equal(parsed.printHighQuality, true);
      assert.equal(parsed.copy, false);
      assert.equal(parsed.modify, false);
      assert.equal(parsed.fillForms, true);
    });
  });

  describe('PdfSecurityHandler & Password Authentication', () => {
    it('should create encryption handler and authenticate user & owner passwords', () => {
      const handler = PdfSecurityHandler.createEncryptionHandler({
        userPassword: 'user123',
        ownerPassword: 'adminMasterPassword',
        algorithm: 'AES-128',
        permissions: {
          print: true,
          copy: false
        }
      });

      assert.equal(handler.isAuthenticated, true);
      assert.equal(handler.authenticatedAs, 'owner');

      // Export /Encrypt dictionary
      const encDict = handler.toDictionary();
      assert.equal(encDict.getName('Filter'), 'Standard');
      assert.equal(encDict.getNumber('V'), 4);
      assert.equal(encDict.getNumber('R'), 4);
      assert.ok(encDict.get('O'));
      assert.ok(encDict.get('U'));

      // Test authentication using freshly created handler from dictionary
      const verifyHandler = PdfSecurityHandler.fromDictionary(encDict, handler.fileId);
      assert.equal(verifyHandler.isAuthenticated, false);

      // Incorrect password fails
      assert.equal(verifyHandler.authenticate('wrongPass'), false);
      assert.equal(verifyHandler.isAuthenticated, false);

      // Correct user password succeeds
      assert.equal(verifyHandler.authenticate('user123'), true);
      assert.equal(verifyHandler.isAuthenticated, true);
      assert.equal(verifyHandler.authenticatedAs, 'user');

      // Verify encrypt / decrypt roundtrip with derived object key
      const payload = new TextEncoder().encode('Sensitive contract details');
      const encrypted = verifyHandler.encrypt(payload, 5, 0);
      assert.notDeepEqual(encrypted, payload);

      const decrypted = verifyHandler.decrypt(encrypted, 5, 0);
      assert.deepEqual(decrypted, payload);
    });

    it('should authenticate with owner password', () => {
      const handler = PdfSecurityHandler.createEncryptionHandler({
        userPassword: 'userPass',
        ownerPassword: 'ownerSuperSecret',
        algorithm: 'AES-128'
      });

      const encDict = handler.toDictionary();
      const verifyHandler = PdfSecurityHandler.fromDictionary(encDict, handler.fileId);

      assert.equal(verifyHandler.authenticate('ownerSuperSecret'), true);
      assert.equal(verifyHandler.isAuthenticated, true);
      assert.equal(verifyHandler.authenticatedAs, 'owner');
    });
  });

  describe('PdfDigitalSignature', () => {
    it('should build signature dictionary and calculate byte range', () => {
      const sig = new PdfDigitalSignature({
        signerName: 'John Hancock',
        reason: 'Approval of quarterly audit report',
        location: 'San Francisco, CA',
        contactInfo: 'john@example.com'
      });

      const dict = sig.toDictionary();
      assert.equal(dict.getName('Type'), 'Sig');
      assert.equal(dict.getName('Filter'), 'Adobe.PPKLite');
      assert.equal(dict.getName('SubFilter'), 'adbe.pkcs7.detached');
      assert.equal(dict.getString('Name'), 'John Hancock');
      assert.equal(dict.getString('Reason'), 'Approval of quarterly audit report');
      assert.ok(dict.get('Contents'));
      assert.ok(dict.get('ByteRange'));

      // Test ByteRange calculation
      // File size 10000, contents hex placeholder starts at offset 4000 with length 1000
      const range = PdfDigitalSignature.calculateByteRange(10000, 4000, 1000);
      assert.deepEqual(range, [0, 4000, 5000, 5000]);

      // Test digest calculation over document bytes excluding placeholder
      const dummyFile = new Uint8Array(10000);
      dummyFile.fill(0xAA, 0, 4000);
      dummyFile.fill(0x00, 4000, 5000); // Signature placeholder
      dummyFile.fill(0xBB, 5000, 10000);

      const digest = PdfDigitalSignature.computeDigest(dummyFile, range, 'SHA-256');
      assert.equal(digest.length, 32);
    });
  });

  describe('Full Document Encryption Round-Trip (Create -> Encrypt -> Save -> Open -> Authenticate)', () => {
    it('should encrypt document on save, require password to decrypt, and restore contents', async () => {
      const doc = PdfDocument.create();
      const page = doc.addPage([612, 792]);
      page.drawText('Classified Information: Project Apollo Specs', {
        x: 50,
        y: 700,
        size: 14
      });

      // Encrypt the document
      doc.encrypt({
        userPassword: 'openSesamePassword',
        ownerPassword: 'adminMasterPassword',
        algorithm: 'AES-128',
        permissions: {
          print: true,
          copy: false
        }
      });

      assert.equal(doc.isEncrypted, true);

      // Save binary PDF
      const encryptedPdfBytes = doc.save();
      assert.ok(encryptedPdfBytes instanceof Uint8Array);
      assert.ok(encryptedPdfBytes.length > 500);

      // Reload encrypted document
      const reloadedDoc = await PdfDocument.open(encryptedPdfBytes);
      assert.equal(reloadedDoc.isEncrypted, true);

      // Before authentication, securityHandler is not authenticated
      assert.equal(reloadedDoc.securityHandler.isAuthenticated, false);

      // Wrong password fails
      const wrongAuth = reloadedDoc.authenticate('wrongPassword');
      assert.equal(wrongAuth, false);

      // Correct password authenticates
      const correctAuth = reloadedDoc.authenticate('openSesamePassword');
      assert.equal(correctAuth, true);
      assert.equal(reloadedDoc.securityHandler.isAuthenticated, true);

      // Verify decrypted content can now be read
      const reloadedPage = reloadedDoc.getPage(0);
      const text = reloadedPage.extractText();
      assert.ok(text.includes('Classified Information: Project Apollo Specs'));
    });
  });

});
