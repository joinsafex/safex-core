const { Client, PrivateKey, ThreadID, Where } = require('@textile/hub');
const { randomBytes } = require('crypto');
const { getThreadId } = require('../dist/utils/threadDb');
const chai = require('chai');
const { writeFile } = require('fs').promises;

const expect = chai.expect;
chai.use(require('chai-as-promised'));

// Import package
const { SafientCore } = require('../dist/index');
const { JsonRpcProvider } = require('@ethersproject/providers');
const { Enums } = require('../dist/index');

describe('Scenario 5 - Creating signal based Safe', async () => {
  let creator;
  let beneficiary;
  let guardianOne;
  let guardianTwo;
  let guardianThree;
  let safeId;
  let provider, chainId;
  let creatorSigner, beneficiarySigner, guardianOneSigner, guardianTwoSigner, guardianThreeSigner;
  let disputeId;
  let admin;
  let creatorSc, beneficiarySc, guardianOneSc, guardianTwoSc, guardianThreeSc;

  const apiKey = process.env.USER_API_KEY;
  const secret = process.env.USER_API_SECRET;

  const ClaimType = {
    SignalBased: 0,
    ArbitrationBased: 1,
    DDayBased: 2,
  };

  before(async () => {
    provider = new JsonRpcProvider('http://localhost:8545');
    const network = await provider.getNetwork();
    chainId = network.chainId;

    admin = await provider.getSigner(0);
    creatorSigner = await provider.getSigner(1);
    beneficiarySigner = await provider.getSigner(2);
    guardianOneSigner = await provider.getSigner(3);
    guardianTwoSigner = await provider.getSigner(4);
    guardianThreeSigner = await provider.getSigner(5);
    pseudoAccount = await provider.getSigner(6);
  });

  //Step 1: Register all users
 //Step 1: Register all users
 it('Should register a Creator', async () => {
    creatorSc = new SafientCore(creatorSigner, Enums.NetworkType.localhost, Enums.DatabaseType.threadDB, apiKey, secret);
    creator = await creatorSc.loginUser();
    const userAddress = await creatorSigner.getAddress();
    if (creator.data === undefined) {
      const res = await creatorSc.createUser('Creator', 'creator@test.com', 0, userAddress);
    } else if (creator.data !== undefined) {
      expect(creator.data.email).to.equal('creator@test.com');
    }
    try{
      const result = await creatorSc.createUser('Creator', 'creator@test.com', 0, userAddress);
    }catch(err){
      expect(err.error.code).to.equal(11);
    }

    const loginUser = await creatorSc.getUser({ did: creator.data.did });
    expect(loginUser.data.name).to.equal('Creator');
    expect(loginUser.data.email).to.equal('creator@test.com');
  });

  it('Should register a beneficiary', async () => {
    beneficiarySc = new SafientCore(beneficiarySigner, Enums.NetworkType.localhost, Enums.DatabaseType.threadDB, apiKey, secret);
    beneficiary = await beneficiarySc.loginUser();
    // SUCCESS : create user A

    const userAddress = await beneficiarySigner.getAddress();
    if (beneficiary.data === undefined) {
      await beneficiarySc.createUser('beneficiary', 'beneficiary@test.com', 0, userAddress);
    } else if (beneficiary.data !== undefined) {
      expect(beneficiary.data.email).to.equal('beneficiary@test.com');
    }

    try{
      const result = await beneficiarySc.createUser('beneficiary', 'beneficiary@test.com', 0, userAddress);
    }catch(err){
      expect(err.error.code).to.equal(11);
    }


    // SUCCESS : get all users (check if the user A was created)
    const loginUser = await beneficiarySc.getUser({ did: beneficiary.data.did });
    expect(loginUser.data.name).to.equal('beneficiary');
    expect(loginUser.data.email).to.equal('beneficiary@test.com');
  });

  it('Should register a Guardian 1', async () => {
    guardianOneSc = new SafientCore(guardianOneSigner, Enums.NetworkType.localhost, Enums.DatabaseType.threadDB, apiKey, secret);
    guardianOne = await guardianOneSc.loginUser();
    // SUCCESS : create user A
    const userAddress = await guardianOneSigner.getAddress();
    guardianOneAddress = userAddress;

    if (guardianOne.data === undefined) {
      await guardianOneSc.createUser('Guardian 1', 'guardianOne@test.com', 0, userAddress);
    } else {
      expect(guardianOne.data.email).to.equal('guardianOne@test.com');
    }

    try{
      const result = await guardianOneSc.createUser('Guardian 1', 'guardianOne@test.com', 0, userAddress);
    }catch(err){
      expect(err.error.code).to.equal(11);
    }

    // SUCCESS : get all users (check if the user A was created)
    const loginUser = await guardianOneSc.getUser({ email: `guardianOne@test.com` });
    expect(loginUser.data.name).to.equal('Guardian 1');
    expect(loginUser.data.email).to.equal('guardianOne@test.com');
  });

  it('Should register a Guardian 2', async () => {
    guardianTwoSc = new SafientCore(guardianTwoSigner, Enums.NetworkType.localhost, Enums.DatabaseType.threadDB, apiKey, secret);
    guardianTwo = await guardianTwoSc.loginUser();
    // SUCCESS : create user A
    const userAddress = await guardianTwoSigner.getAddress();

    if (guardianTwo.data === undefined) {
      await guardianTwoSc.createUser('Guardian 2', 'guardianTwo@test.com', 0, userAddress);
    } else {
      expect(guardianTwo.data.email).to.equal('guardianTwo@test.com');
    }

    try{
      const result = await guardianTwoSc.createUser('Guardian 2', 'guardianTwo@test.com', 0, userAddress);
    }catch(err){
      expect(err.error.code).to.equal(11);
    }

    // SUCCESS : get all users (check if the user A was created)
    const loginUser = await guardianTwoSc.getUser({ email: `guardianTwo@test.com` });
    expect(loginUser.data.name).to.equal('Guardian 2');
    expect(loginUser.data.email).to.equal('guardianTwo@test.com');
  });

  it('Should register a Guardian 3', async () => {
    guardianThreeSc = new SafientCore(
      guardianThreeSigner,
      Enums.NetworkType.localhost,
      Enums.DatabaseType.threadDB,
      apiKey,
      secret
    );
    guardianThree = await guardianThreeSc.loginUser();
    
    const userAddress = await guardianThreeSigner.getAddress();
    if (guardianThree.data === undefined) {
      await guardianThreeSc.createUser('Guardian 3', 'guardianThree@test.com', 0, userAddress);
    } else {
      expect(guardianThree.data.email).to.equal('guardianThree@test.com');
    }

    try{
      const result = await guardianThreeSc.createUser('Guardian 3', 'guardianThree@test.com', 0, userAddress);
    }catch(err){
      expect(err.error.code).to.equal(11);
    }

    // SUCCESS : get all users (check if the user A was created)
    const loginUser = await guardianThreeSc.getUser({ did: guardianThree.data.did });
    expect(loginUser.data.name).to.equal('Guardian 3');
    expect(loginUser.data.email).to.equal('guardianThree@test.com');
  });

  //should create a safe onChain and offChain
  it('Should create generic safe with "Testing Safe data" with Signal Based Claim', async () => {
    const generic = {
      data: 'Testing safe Data',
    };
    const safeData = {
      data: generic,
    };
    const safeid = await creatorSc.createSafe(
      creator.data.did,
      beneficiary.data.did,
      safeData,
      true,
      ClaimType.SignalBased,
      10,
      0
    );
    safeId = safeid.data;
    const safe = await creatorSc.getSafe(safeId);
    expect(safe.data.creator).to.equal(creator.data.did);
  });

  //Step 3: Create a claim
  it('Should create a claim', async () => {
    const file = {
      name: 'signature.jpg',
    };
    disputeId = await beneficiarySc.createClaim(safeId, file, 'Testing Evidence', 'Lorsem Text');
    expect(disputeId.data).to.be.a('number');
  });

  it('Should send signal after claim', async () => {
    const result = await creatorSc.createSignal(safeId); //Passing a claim
    expect(result.data.status).to.equal(1);
  });

  it('Should update the stage on threadDB', async () => {
    const result = await beneficiarySc.syncStage(safeId);
    expect(result.data).to.equal(true);
  });

  it('Should try recovery by guardian 1', async () => {
    const data = await guardianOneSc.reconstructSafe(safeId, guardianOne.data.did);
    expect(data.data).to.equal(false);
  });

  it('Should try recovery by guardian 2', async () => {
    const data = await guardianTwoSc.reconstructSafe(safeId, guardianTwo.data.did);
    expect(data.data).to.equal(false);
  });

  it('Should try recovering data for the beneficiary', async () => {
    try{
        const data = await beneficiarySc.recoverSafeByBeneficiary(safeId, beneficiary.data.did);
    }catch(err){
        expect(err.error.code).to.eql(203)
    }
  });
});
