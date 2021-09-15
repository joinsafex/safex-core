import { IDX } from '@ceramicstudio/idx';
import { Client, PrivateKey, ThreadID, Where } from '@textile/hub';
import { JsonRpcProvider, JsonRpcSigner, TransactionReceipt, TransactionResponse } from '@ethersproject/providers';
import {SafientClaims} from "@safient/claims"
import {ClaimType} from "@safient/claims/dist/types/Types"
import {ethers} from "ethers"


import { getThreadId } from './utils/threadDb';
import {generateIDX} from './lib/identity'
import {generateSignature} from './lib/signer'
// @ts-ignore
import { Connection, User, UserBasic, Users, SafeData, Shard, SafeCreation, Share, EncryptedSafeData, UserSchema, Utils } from './types/types';
import {definitions} from "./utils/config.json"
import {utils} from "./lib/helpers"
import { JWE } from 'did-jwt';
import { decryptData } from './utils/aes';
// import {Crypto} from "./crypto/index"
// import { Database } from './database';
import {init} from "./logic/index"
import { Database } from './database';
import { Crypto } from './crypto';
require('dotenv').config();


const safeStages = {
  "ACTIVE" : 0,
  "CLAIMING": 1,
  "RECOVERING": 2,
  "RECOVERED": 3,
  "CLAIMED": 4
}

const claimStages = {
    "ACTIVE": 0,
    "PASSED": 1,
    "FAILED": 2,
    "REJECTED": 3
}
export class SafientCore {
  private signer: JsonRpcSigner;
  private utils: utils;
  private provider: JsonRpcProvider;
  private claims: SafientClaims
  private connection: Connection
  private crypto: Crypto
  private database: Database
  private databaseType: string
  private Utils: Utils

  constructor(signer: JsonRpcSigner, chainId: number, databaseType: string) {
    this.signer = signer;
    this.utils = new utils();
    this.provider = this.provider
    this.claims = new SafientClaims(signer, chainId)
    this.databaseType = databaseType
  }

  /**
   * API 1:connectUser
   *
   */
  connectUser = async (apiKey:any, secret:any): Promise<Connection> => {
    try{
      const seed = await generateSignature(this.signer)
      const {idx, ceramic} = await generateIDX(Uint8Array.from(seed))
      const identity = PrivateKey.fromRawEd25519Seed(Uint8Array.from(seed));
      const client = await Client.withKeyInfo({
        key: apiKey,
        secret: secret,
      });
      await client.getToken(identity);
      const threadId = ThreadID.fromBytes(Uint8Array.from(await getThreadId()));
      const connectionData = { client, threadId, idx };
      this.connection = connectionData;
      this.Utils = init(this.databaseType, this.connection);
      this.crypto = this.Utils.crypto
      this.database = this.Utils.database
      return connectionData
    }catch(err){
      throw new Error(`Error, while connecting the user, ${err}`);
    }
  };

  /**
   * API 2:registerUser
   *
   */

  registerNewUser = async (
    name: string,
    email: string,
    signUpMode: number,
    userAddress: string
  ): Promise<String> => {
    try {
      let idx: IDX | null = this.connection.idx
      let did: string = idx?.id || ''
      const data: UserSchema = {
        did,
        name,
        email,
        safes: [],
        signUpMode,
        userAddress
      };

      //get the threadDB user
      const result : String = await this.database.db.registerNewUser(data)
      if(result !== ''){
        const ceramicResult = await idx?.set(definitions.profile, {
          name: name,
          email: email
        })
        return result
      }else {
        return `${email} already registered.`
      }
    
    } catch (err) {
      throw new Error(`Error while registering user, ${err}`);
    }
  };

  /**
   * API 3:getLoginUser
   *
   */
  getLoginUser = async (did:string): Promise<User | any> => {
    try {
      const result: any = await this.database.db.getLoginUser(did);
      return result
    } catch (err) {
      throw new Error(`${did} not registered`);
    }
  };


  /**
   * API 4:getAllUsers
   *
   */

  getUsers = async (): Promise<Users> => {
    try {
      const users: Users = await this.database.db.getUsers();
      return users;
    } catch (err) {
      throw new Error("Error while getting new users");
    }
  };

   /**
   * API 5:randomGuardians
   *
   */
  private randomGuardians = async (creatorDID: string | any, beneficiaryDID: string | any): Promise<string[]> => {

    try{
      const guardians: string[] = await this.database.db.generateRandomGuardians(creatorDID, beneficiaryDID);
      return guardians;
    }catch(err){
      throw new Error(`Couldn't fetch random guardians, ${err}`);
    }
  };


  /**
   * API 6: Query Users
   *  
   */

  queryUser = async (email:string): Promise<UserBasic | Boolean> => {
    try {

      const result: UserBasic | Boolean = await this.database.db.queryUserEmail(email)
      return result;

      }catch (err) {
      throw new Error("Error while querying user");
    }
  };



  /**
   * 
   * CORE API 1: createNewSafe
   */

  createNewSafe = async (
    creatorDID: string,
    beneficiaryDID:string,
    safeData: any,
    onChain: boolean,
    claimType: number,
    signalingPeriod: number
  ): Promise<string> => {
    try {
        let guardians: User[] = [];
        let txReceipt: TransactionReceipt | undefined

        //userQueryDid function
        const creatorUser: User[] = await this.database.db.queryUserDid(creatorDID)
        const beneficiaryUser: User[] = await this.database.db.queryUserDid(beneficiaryDID)



          const guardiansDid: string[] = await this.randomGuardians(creatorDID, beneficiaryDID);


          for(let guardianIndex = 0; guardianIndex < guardiansDid.length; guardianIndex++){
              let guardianData: User = await this.getLoginUser(guardiansDid[guardianIndex]);
              guardians.push(guardianData)
          }


          const secretsData = this.crypto.generateSecrets(guardians)

          //note 1: Change here
          const signature: string = await this.signer.signMessage(ethers.utils.arrayify(secretsData.hash));


          const encryptedSafeData: EncryptedSafeData = await this.crypto.encryptSafeData(
            safeData,
            beneficiaryDID,
            this.connection.idx?.id,
            this.connection,
            guardiansDid,
            signature,
            secretsData.recoveryMessage,
            secretsData.secrets
            )
          //


          const data: SafeCreation = {
            creator: this.connection.idx?.id,
            guardians: guardiansDid,
            beneficiary: beneficiaryDID,
            encSafeKey: encryptedSafeData.creatorEncKey,
            encSafeData: encryptedSafeData.encryptedData,
            stage: safeStages.ACTIVE,
            encSafeKeyShards: encryptedSafeData.shardData,
            claims: [],
            onChain: onChain,
            claimType: claimType,
            signalingPeriod: signalingPeriod
          };

          const safe: string[] = await this.database.db.createSafe(data)

      if(onChain === true){
        const metaDataEvidenceUri:string = await this.utils.createMetaData('0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512', creatorUser[0].userAddress);

        const arbitrationFee: number = await this.claims.arbitrator.getArbitrationFee()
        const guardianFee: number = 0.1;


        
        if(claimType === ClaimType.ArbitrationBased){
          const totalFee: string = String(ethers.utils.parseEther(String(arbitrationFee + guardianFee)))
          const tx: TransactionResponse = await this.claims.safientMain.createSafe(beneficiaryUser[0].userAddress, safe[0], claimType, signalingPeriod, metaDataEvidenceUri, totalFee)
          txReceipt = await tx.wait();
        }else if(claimType === ClaimType.SignalBased){
          const totalFee: string = String(ethers.utils.parseEther(String(guardianFee)))
          const tx: TransactionResponse = await this.claims.safientMain.createSafe(beneficiaryUser[0].userAddress, safe[0], claimType, signalingPeriod , '', totalFee ) //NOTE: Change the time from 1 to required period here
          txReceipt = await tx.wait();
        }
        
      }

      if(txReceipt?.status === 1 || onChain === false){

            if (creatorUser[0].safes.length===0) {
                creatorUser[0].safes = [{
                    safeId: safe[0],
                    type: 'creator'
                }]
            }else {
                creatorUser[0].safes.push({
                    safeId: safe[0],
                    type: 'creator'
                })
            }

            if (beneficiaryUser[0].safes.length===0) {
                beneficiaryUser[0].safes = [{
                    safeId: safe[0],
                    type: 'beneficiary'
                }]
            }else {
                beneficiaryUser[0].safes.push({
                    safeId: safe[0],
                    type: 'beneficiary'
                })
            }

            for(let guardianIndex = 0; guardianIndex < guardiansDid.length; guardianIndex++){
              if(guardians[guardianIndex].safes.length === 0){
                guardians[guardianIndex].safes = [{
                  safeId: safe[0],
                  type: 'guardian'
                }]
              }else{
                guardians[guardianIndex].safes.push({
                  safeId: safe[0],
                  type: 'guardian'
              })
              }
          }

            
            await this.database.save(creatorUser[0], 'Users');
            await this.database.save(beneficiaryUser[0], 'Users')

          for(let guardianIndex = 0; guardianIndex < guardiansDid.length; guardianIndex++){
            await this.database.save(guardians[guardianIndex], 'Users')
          }
      }

      if(txReceipt?.status === 0){
        await this.database.delete(safe[0], 'Users')
        console.log("Transaction Failed!");
      }

    return safe[0];

    } catch (err) {
      throw new Error(`Error while creating a safe. ${err}`);
    }
  };

  //threadDB function
  getSafeData = async (safeId: string): Promise<SafeData> => {
    try {
      const result: SafeData = await this.database.db.getSafeData(safeId)
      return result;
    } catch (err) {
      throw new Error("Error while fetching safe data");
    }
  };

  claimSafe = async (
    safeId: string,
    file: any,
    evidenceName: string,
    description: string
    ): Promise<number> => {
    try {
        
        let evidenceUri: string = ''
        let tx: TransactionResponse
        let disputeId:number = 0
        let txReceipt: any
        let createSafetx: TransactionResponse
        let createSafetxReceipt: TransactionReceipt
        let dispute: any

        const safe: SafeData = await this.getSafeData(safeId)
        let creatorUser:User[]  = await this.database.db.queryUserDid(safe.creator)

        if(safe.onChain === true && safe.stage === safeStages.ACTIVE){

          if(safe.claimType === ClaimType.ArbitrationBased){
            evidenceUri = await this.utils.createClaimEvidenceUri(file, evidenceName, description)
            tx = await this.claims.safientMain.createClaim(safe._id, evidenceUri)
            txReceipt = await tx.wait()
          }else if(safe.claimType === ClaimType.SignalBased){
            tx = await this.claims.safientMain.createClaim(safe._id, '')
            txReceipt = await tx.wait()
          }
          
        }
      if(safe.onChain === false && safe.stage === safeStages.ACTIVE){

        const metaDataEvidenceUri:string = await this.utils.createMetaData('0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512', creatorUser[0].userAddress);
        const arbitrationFee: number = await this.claims.arbitrator.getArbitrationFee()
        const guardianFee: number = 0.1;
        const totalFee: string = String(ethers.utils.parseEther(String(arbitrationFee + guardianFee)))

        //safeSync
        if(safe.claimType === ClaimType.ArbitrationBased){
         createSafetx = await this.claims.safientMain.syncSafe(creatorUser[0].userAddress, safeId, safe.claimType, safe.signalingPeriod, metaDataEvidenceUri, totalFee,)
         createSafetxReceipt = await createSafetx.wait();
        }
        else{
           createSafetx = await this.claims.safientMain.syncSafe(creatorUser[0].userAddress, safeId, safe.claimType, safe.signalingPeriod, '', '') //Note update time here
           createSafetxReceipt = await createSafetx.wait();
        }
        if(createSafetxReceipt.status === 1){
          evidenceUri = await this.utils.createClaimEvidenceUri(file, evidenceName, description)
          tx = await this.claims.safientMain.createClaim(safe._id, evidenceUri)
          txReceipt = await tx.wait()
        }
      }

      if(txReceipt.status === 1 && safe.stage === safeStages.ACTIVE){
        if(safe.claimType === ClaimType.ArbitrationBased){
          dispute = txReceipt.events[2].args[2];
          disputeId = parseInt(dispute._hex);
        }else if(safe.claimType === ClaimType.SignalBased){
          dispute = txReceipt.events[0].args[2];
          disputeId = parseInt(dispute._hex);
        }
        
        safe.stage = safeStages.CLAIMING

        if( safe.claims.length === 0){
          safe.claims = [{
                "createdBy": this.connection.idx?.id,
                "claimStatus": claimStages.ACTIVE,
                "disputeId": disputeId
            }]
        }else{
          safe.claims.push({
              "createdBy": this.connection.idx?.id,
              "claimStatus": claimStages.ACTIVE,
              "disputeId": disputeId
            })
        }
        await this.database.save(safe, 'Safes')
    }
      return disputeId;
    } catch (err) {
      throw new Error(`Error while creating a claim`);
    }
  };

  guardianRecovery = async (safeId: string, did: string): Promise<boolean> => {
    try {


      const safe: SafeData = await this.getSafeData(safeId)
      const indexValue = safe.guardians.indexOf(did)
      let recoveryCount: number = 0;
      let recoveryStatus: boolean = false

      if(safe.stage === safeStages.RECOVERING) {
        const decShard = await this.connection.idx?.ceramic.did?.decryptDagJWE(
          safe.encSafeKeyShards[indexValue].encShard
        )
        safe.encSafeKeyShards[indexValue].status = 1
        safe.encSafeKeyShards[indexValue].decData = decShard

        safe.encSafeKeyShards.map((safeShard) => {
          if(safeShard.status === 1){
            recoveryCount = recoveryCount + 1;
          }
        })

        if(recoveryCount >= 2){
          safe.stage = safeStages.RECOVERED
        }else{
          safe.stage = safeStages.RECOVERING
        }
        recoveryStatus = true
        await this.database.save(safe, 'Safes')
      }
      else{
        recoveryStatus = false
      }

      return recoveryStatus;

      } catch (err) {
      throw new Error(`Error while guardian Recovery`);
    }
  };

  creatorSafeRecovery = async(safeId: string): Promise<any> =>{
    try{
      const safeData:SafeData = await this.getSafeData(safeId);
      const encSafeData = safeData.encSafeData
      const data = await this.crypto.decryptSafeData(safeData.encSafeKey, this.connection, encSafeData);
      const reconstructedData = JSON.parse(data.toString());
      return reconstructedData;
    }catch(err){
      throw new Error(`Error whole decrypting data, ${err}`)
    }
  }


  //Has to be a threadDB function
  private updateStage = async(safeId: string, claimStage: number, safeStage: number): Promise<boolean> => {
        try{

          const result:boolean = await this.database.db.updateStage(safeId, claimStage, safeStage)
          return result;

        }catch(err){
          throw new Error(`Error while updating a stage ${err}`)
        }
      }

    beneficiarySafeRecovery = async (safeId: string, did: string): Promise<any> => {
        try {

          let shards: Object[] = [];
          let reconstructedSafeData: any;
          let safeData: any
          let result: any
          const safe: SafeData = await this.getSafeData(safeId)

          if(safe.stage === safeStages.RECOVERED || safe.stage === safeStages.CLAIMED){

            safe.encSafeKeyShards.map(share => {
              share.status === 1 ? shards.push(share.decData.share) : null
            })

            reconstructedSafeData = await this.crypto.reconstructSafeData(shards);
            safeData = await this.crypto.decryptSafeData(reconstructedSafeData.beneficiaryEncKey, this.connection, Buffer.from(safe.encSafeData))

            if(safeData !== undefined && safe.stage === safeStages.RECOVERED){
              await this.updateStage(safeId, claimStages.PASSED, safeStages.CLAIMED);
              result = JSON.parse(safeData.toString());
            }else{
              result = undefined
            }

          }

          return result

          } catch (err) {
          throw new Error(`Error while recovering data for Beneficiary, ${err}`);
        }
      };

      //Onchain function
      getOnChainData = async (safeId: string) => {
        try{
          const data = await this.claims.safientMain.getSafeBySafeId(safeId)
          return data
        }catch(err){
          throw new Error('Error while getting onChain data')
        }
      }

      //Onchain function
      getOnChainClaimData = async(claimId: number) => {
        try{
          const data = await this.claims.safientMain.getClaimByClaimId(claimId)
          return data;
        }catch(err){
          throw new Error(`Error while getting onChain claim data ${err}`)
        }

      }

      //OnChain function
      getStatus = async(safeId: string, claimId: number) => {
        try{
          const claimStage = await this.claims.safientMain.getClaimStatus(safeId, claimId);
          return claimStage;
        }catch(err){
          throw new Error(`Error while getting onChain claim data ${err}`)
        }

      }

      syncStage = async(safeId: string): Promise<boolean> => {
        try{
          
          let disputeId: number = 0
          let claimIndex : number = 0
          const safe: SafeData = await this.getSafeData(safeId)

          const claims = safe.claims
          claims.map((claim,index) => {
            if(claim.claimStatus === claimStages.ACTIVE){
              disputeId = claim.disputeId;
              claimIndex = index
            }
          })
          const claimStage = await this.claims.safientMain.getClaimStatus(safeId, disputeId);
          if(claimStage === claimStages.PASSED){
            safe.stage = safeStages.RECOVERING;
            safe.claims[claimIndex].claimStatus = claimStages.PASSED;
          }
          if(claimStage === claimStages.FAILED || claimStage === claimStages.REJECTED){
            safe.stage = safeStages.ACTIVE;
            safe.claims[claimIndex].claimStatus = claimStage;
          }

          await this.database.save(safe, 'Safes')
          return true;
        }catch(err){
          throw new Error(`Error while syncing stage data, ${err}`)
        }

      }


      /**
       * Disclaimer: Internal API only. Not production API.
       * Use at your loss.
       * If you reading this code and come across this. Be warned not to use this at all
       *  */
      giveRuling = async(disputeId: number, ruling: number): Promise<boolean> => {
        try{
          const result: boolean = await this.claims.arbitrator.giveRulingCall(disputeId, ruling)
          return result;
        }catch(err){
          throw new Error('Error while giving a ruling for dispute')
        }

      }

      sendSignal = async(safeId: string): Promise<TransactionReceipt> => {
        try{
           const tx: TransactionResponse = await this.claims.safientMain.sendSignal(safeId)
           const txReceipt: TransactionReceipt = await tx.wait()
           if(txReceipt.status === 1){
            await this.updateStage(safeId, claimStages.ACTIVE, safeStages.ACTIVE);
           }
          return txReceipt;
        }catch(err){
          throw new Error(`Error while sending a signal, ${err}`)
        }

      }




      incentiviseGuardians = async(safeId: string): Promise<boolean> =>{
        try{
          
          let shards: any = []
          let guardianArray: any = [];
          let guardianSecret: string[] = [];
          let tx: boolean = false

          const safe: SafeData = await this.getSafeData(safeId)

            if(safe.stage === safeStages.CLAIMED){
              safe.encSafeKeyShards.map((share) => {
                  if(share.status === 1){
                    shards.push(share.decData.share)
                    guardianSecret.push(share.decData.secret);
                  }
                })

                if(shards.length !== 0){
                  const reconstructedData: Share = await this.crypto.reconstructSafeData([Buffer.from(shards[0]), Buffer.from(shards[1])])
                  const message = reconstructedData.message;
                  message.data.guardians.map((guardian: any) => {
                    const guardianTuple = [guardian.secret, guardian.address]
                    guardianArray.push(guardianTuple);
                  })

                  tx = await this.claims.safientMain.guardianProof(
                    JSON.stringify(message),
                    reconstructedData.signature,
                    guardianArray,
                    guardianSecret,
                    safeId
                    )
                }
            }

            return tx

        }catch(e){
          throw new Error(`Error while incentiving the guardians ${e}`)
        }
      }


}
