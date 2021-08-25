const { ThreadID } = require('@textile/hub');
const { SafientClaims } = require('@safient/claims');
const { utils } = require('ethers');
const { getThreadId } = require('../dist/utils/threadDb');
const fs = require('fs');
const chai = require('chai');

const expect = chai.expect;
chai.use(require('chai-as-promised'));

const { SafientSDK } = require('../dist/index');
const { JsonRpcProvider } = require('@ethersproject/providers');

describe('Scenario 3 - Creating safe onChain and Passed the dispute', async () => {
    let admin;
    let creator;
    let beneficiary;
    let guardianOne;
    let guardianTwo;
    let guardianThree;
    let safeId;
    let provider, chainId;
    let creatorSigner, beneficiarySigner, guardianOneSigner, guardianTwoSigner, guardianThreeSigner;
    let disputeId
    let creatorSc, beneficiarySc, guardianOneSc, guardianTwoSc, guardianThreeSc;

    const apiKey = process.env.USER_API_KEY
    const secret = process.env.USER_API_SECRET

  before(async () => {
    provider = new JsonRpcProvider('http://localhost:8545');
    const network = await provider.getNetwork();
    chainId = network.chainId;

    admin = await provider.getSigner(0)
    creatorSigner = await provider.getSigner(1);
    
    beneficiarySigner = await provider.getSigner(2);
    guardianOneSigner = await provider.getSigner(3);
    guardianTwoSigner = await provider.getSigner(4);
    guardianThreeSigner = await provider.getSigner(5);
    pseudoAccount = await provider.getSigner(6)
  })
  //Step 1: Register all users
  it('Should register a Creator', async () => {
  
    creatorSc = new SafientSDK(creatorSigner, chainId);
    creator = await creatorSc.safientCore.connectUser(apiKey, secret);
    
    const userAddress = await creatorSigner.getAddress()
    await creatorSc.safientCore.registerNewUser('Creator', 'creator@test.com', 0, userAddress);

    // FAILURE : try creating user A again
    await expect(creatorSc.safientCore.registerNewUser('Creator', 'creator@test.com', 0, userAddress)).to.eventually.be.eql('creator@test.com already registered.')

    // SUCCESS : get all users (check if the user A was created)
    const loginUser = await creatorSc.safientCore.getLoginUser(creator.idx.id);
    expect(loginUser.name).to.equal('Creator');
    expect(loginUser.email).to.equal('creator@test.com');

});

it('Should register a beneficiary', async () => {
  
    beneficiarySc = new SafientSDK(beneficiarySigner, chainId);
    beneficiary = await beneficiarySc.safientCore.connectUser(apiKey, secret);
    // SUCCESS : create user A

    const userAddress = await beneficiarySigner.getAddress()
    await beneficiarySc.safientCore.registerNewUser('beneficiary', 'beneficiary@test.com', 0, userAddress);

    // FAILURE : try creating user A again
    await expect(beneficiarySc.safientCore.registerNewUser('beneficiary', 'beneficiary@test.com', 0, userAddress)).to.eventually.be.eql('beneficiary@test.com already registered.');

    // SUCCESS : get all users (check if the user A was created)
    const loginUser = await beneficiarySc.safientCore.getLoginUser(beneficiary.idx.id);
    expect(loginUser.name).to.equal('beneficiary');
    expect(loginUser.email).to.equal('beneficiary@test.com');
});


it('Should register a Guardian 1', async () => {
    guardianOneSc = new SafientSDK(guardianOneSigner, chainId);
    guardianOne = await guardianOneSc.safientCore.connectUser(apiKey, secret);
    // SUCCESS : create user A
    const userAddress = await guardianOneSigner.getAddress()
    await guardianOneSc.safientCore.registerNewUser('Guardian 1', 'guardianOne@test.com', 0, userAddress);

    // FAILURE : try creating user A again
    await expect(guardianOneSc.safientCore.registerNewUser('Guardian 1', 'guardianOne@test.com', 0, userAddress)).to.eventually.be.eql('guardianOne@test.com already registered.');

    // SUCCESS : get all users (check if the user A was created)
    const loginUser = await guardianOneSc.safientCore.getLoginUser(guardianOne.idx.id);
    expect(loginUser.name).to.equal('Guardian 1');
    expect(loginUser.email).to.equal('guardianOne@test.com');
});

it('Should register a Guardian 2', async () => {
    guardianTwoSc = new SafientSDK(guardianTwoSigner, chainId);
    guardianTwo = await guardianTwoSc.safientCore.connectUser(apiKey, secret);
    // SUCCESS : create user A
    const userAddress = await guardianTwoSigner.getAddress()
    await guardianTwoSc.safientCore.registerNewUser('Guardian 2', 'guardianTwo@test.com', 0, userAddress);

    // FAILURE : try creating user A again
    await expect(guardianTwoSc.safientCore.registerNewUser('Guardian 2', 'guardianTwo@test.com', 0, userAddress)).to.eventually.be.eql('guardianTwo@test.com already registered.');

    // SUCCESS : get all users (check if the user A was created)
    const loginUser = await guardianTwoSc.safientCore.getLoginUser(guardianTwo.idx.id);
    expect(loginUser.name).to.equal('Guardian 2');
    expect(loginUser.email).to.equal('guardianTwo@test.com');
});

it('Should register a Guardian 3', async () => {
    guardianThreeSc = new SafientSDK(guardianThreeSigner, chainId);
    guardianThree = await guardianThreeSc.safientCore.connectUser(apiKey, secret);

    const userAddress = await guardianThreeSigner.getAddress()
    await guardianThreeSc.safientCore.registerNewUser('Guardian 3', 'guardianThree@test.com', 0, userAddress);

    // FAILURE : try creating user A again
    await expect(guardianThreeSc.safientCore.registerNewUser('Guardian 3', 'guardianThree@test.com', 0, userAddress)).to.eventually.be.eql('guardianThree@test.com already registered.');

    // SUCCESS : get all users (check if the user A was created)
    const loginUser = await guardianThreeSc.safientCore.getLoginUser(guardianThree.idx.id);
    expect(loginUser.name).to.equal('Guardian 3');
    expect(loginUser.email).to.equal('guardianThree@test.com');
});

  describe('Safe creation and claim creation', async () => {
    describe('Onchain', async () => {
      it('Should Create Safe', async () => {
      
          const userAddress = await creatorSigner.getAddress()

          safeId = await creatorSc.safientCore.createNewSafe(
            creator.idx.id,
            beneficiary.idx.id,
            'This is a test data',
            true
          );

          // check safe - threadDB
          const safeDataThreadDB = await creatorSc.safientCore.getSafeData(safeId);
          expect(safeDataThreadDB.creator).to.equal(creator.idx.id);

          // check safe - onchain (since this is an onChain=true safe creation)
          const safeDataOnchain = await creatorSc.safientCore.getOnChainData(safeId);
          expect(safeDataOnchain.safeCreatedBy).to.equal(userAddress);
        
      });

      it('Should claim safe', async () => {
      

          const file = {
            name: 'signature.jpg',
          };

          disputeId = await beneficiarySc.safientCore.claimSafe(
            safeId,
            file,
            'Test evidence',
            'This is an evidence description'
          );

          // check claim on the safe - threadDB
          const safeDataThreadDB = await beneficiarySc.safientCore.getSafeData(safeId);
          expect(safeDataThreadDB.claims[0].createdBy).to.equal(beneficiary.idx.id);
          expect(safeDataThreadDB.claims[0].disputeId).to.equal(disputeId);
          expect(safeDataThreadDB.claims[0].claimStatus).to.equal(0); // claimStages.ACTIVE
          expect(safeDataThreadDB.stage).to.equal(1); // safeStages.CLAIMING
          expect(safeDataThreadDB.beneficiary).to.equal(beneficiary.idx.id);
       
      });
    });
  });

  describe('Ruling...', async () => {
    it('Should PASS ruling on the dispute', async () => {
     
        const sc = new SafientSDK(admin, chainId);

        const result = await sc.safientCore.giveRuling(disputeId, 1) //Passing a claim
        expect(result).to.equal(true);
     
    });
  });


  describe('Sync safe stage', async () => {
    it('Updates the safe stage on threadDB according to the ruling', async () => {
 
     
        const result = await beneficiarySc.safientCore.syncStage(safeId)
        expect(result).to.equal(true);

        // check safe - threadDB
        const safeDataThreadDB = await beneficiarySc.safientCore.getSafeData(safeId);
        expect(safeDataThreadDB.stage).to.equal(2); // safeStages.RECOVERING
        expect(safeDataThreadDB.claims[0].claimStatus).to.equal(1); // claimStages.PASSED      
      
    });
  });

  describe('Guardian recovery', async () => {
    it('Recovery done by guardian 1', async () => {
   

        const result = await guardianOneSc.safientCore.guardianRecovery(safeId, guardianOne.idx.id);
        expect(result).to.equal(true);

        // check safe - threadDB (safe stage should still be in RECOVERING stage)
        const safeDataThreadDB = await guardianOneSc.safientCore.getSafeData(safeId);
        expect(safeDataThreadDB.stage).to.equal(2); // safeStages.RECOVERING
     
    });

    it('Recovery done by guardian 2', async () => {
     

        const result = await guardianTwoSc.safientCore.guardianRecovery(safeId, guardianTwo.idx.id);
        expect(result).to.equal(true);

        // check safe - threadDB (safe stage should be in RECOVERED stage)
        const safeDataThreadDB = await guardianTwoSc.safientCore.getSafeData(safeId);
        expect(safeDataThreadDB.stage).to.equal(3); // safeStages.RECOVERED
      
    });
  });

  describe('Beneficiary data recovery', async () => {
    it('Data is recovered by the beneficiary', async () => {
     

        const result = await beneficiarySc.safientCore.recoverData(safeId, beneficiary.idx.id);

        expect(result.data).to.equal('This is a test data');
      
    });
  });

  describe('Guardian incentivisation', async () => {
    it('Guardian 1 and guardian 2 are incentivised', async () => {
      
        const prevBalance = await guardianOneSigner.getBalance();
        const result = await guardianOneSc.safientCore.incentiviseGuardians(safeId);
        const newBalance = await guardianOneSigner.getBalance();
        expect((parseInt(newBalance) > parseInt(prevBalance))).to.equal(true);
      
    });
  });
});
