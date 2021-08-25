import { IDX } from '@ceramicstudio/idx';
import { Client, PrivateKey, ThreadID, Where } from '@textile/hub';
import { JWE } from 'did-jwt';
import { randomBytes } from 'crypto' 
import {ethers} from "ethers"

// @ts-ignore
import shamirs from 'shamirs-secret-sharing';
import { Connection, User, UserBasic, Users, SafeData, Shard, RecoveryMessage, GuardianSecrets, Evidence } from '../types/types';
import {generateCipherKey, encryptData, decryptData} from "../utils/aes"
// import { TextEncoder } from 'util';
import {ipfsPublish} from "../utils/ipfs"
require('dotenv').config();
const util = require('util')
var environment = require("browser-or-node");

export class utils {
 
    private safientAgreementLink: string =
    'https://ipfs.kleros.io/ipfs/QmPMdGmenYuh9kzhU6WkEvRsWpr1B8T7nVWA52u6yoJu13/Safex Agreement.png';
    private safientAgreementURI: string = '/ipfs/QmPMdGmenYuh9kzhU6WkEvRsWpr1B8T7nVWA52u6yoJu13/Safex Agreement.png';
    // private encoder = new util.TextEncoder();



    
    generateSafeData = async (
        safeData: any, 
        beneficiaryDid: any, 
        creatorDid: any, 
        creator: Connection, 
        guardians: string [],
        signature: string,
        recoveryMessage: string,
        secrets: string[]
        ): 
        Promise<any> => {
        try{
             //generate a AES key
            const aesKey: any = await generateCipherKey();

            //encrypt the data
            const encryptedData: Object = await encryptData(
                Buffer.from(JSON.stringify({data: safeData})),
                aesKey
            )

            //Encrypt AES for creator
            const creatorEncKey = await creator.idx?.ceramic.did?.createDagJWE(aesKey, [creatorDid]);

            //Encrypt AES for beneficiary
            const beneficiaryEncKey = await creator.idx?.ceramic.did?.createDagJWE(aesKey, [beneficiaryDid]);
            
            const Sharedata: Object = {
                beneficiaryEncKey: beneficiaryEncKey,
                message : JSON.parse(recoveryMessage),
                signature: signature
            }

            const secretShares: Buffer[] = shamirs.split(JSON.stringify(Sharedata), {shares: 3, threshold: 2})

            let shardData: any[] = []
            for(let index = 0; index < secretShares.length; index++) {
                shardData.push({
                    status: 0,
                    encShard: await creator.idx?.ceramic.did?.createDagJWE({
                        share: secretShares[index],
                        secret: secrets[index]
                    }, [guardians[index]]),
                    decData: null
                })
                
            };
               
            let data: Object = {
                creatorEncKey: creatorEncKey,
                beneficiaryEncKey: beneficiaryEncKey,
                encryptedData: encryptedData,
                shardData: shardData,
            }

            return data
        }
       catch(e){
        throw new Error(`Error while generating safe data`)
       }

    }


    reconstructShards = async(
        beneficiary: Connection,
        shards: any,
        encryptedSafeData: Buffer
    ): Promise<any> => {
        try{
            const reconstructedData = shamirs.combine([Buffer.from(shards[0]), Buffer.from(shards[1])])

            const encryptedData = JSON.parse(reconstructedData.toString());
            const aesKey = await beneficiary.idx?.ceramic.did?.decryptDagJWE(encryptedData.beneficiaryEncKey);
    
            const decryptedData = await decryptData(Buffer.from(encryptedSafeData), aesKey)
    
            return JSON.parse(decryptedData.toString())
        }catch(err){
            throw new Error(`Error while recontructing data`)
        }
    }

    generateRecoveryMessage = (guardians: User[]): RecoveryMessage => {

        try{
            let gurdiansArray: GuardianSecrets[] = []
            let hash: string
            let secrets: string[] = []
    
            guardians.map((guardian: User) => {
                const guardianSecret = randomBytes(4)
                secrets.push(guardianSecret.toString('hex'))
                gurdiansArray.push({
                    secret: ethers.utils.solidityKeccak256(['string'],[guardianSecret.toString('hex')]),
                    address: guardian.userAddress.toLowerCase()
                })
            })
    
            const recoveryMessage: string = JSON.stringify({
                data: {
                    guardians: gurdiansArray
                }
            })
    
            hash = ethers.utils.solidityKeccak256(["string"], [recoveryMessage])
    
            const data: RecoveryMessage = {
                guardians: gurdiansArray,
                hash: hash,
                recoveryMessage:recoveryMessage,
                secrets: secrets
            }
    
            return data
        }catch(err){
            throw new Error(`Error while creating recovery messages, ${err}`)
        }
    }


     createMetaData = async (safexMainContractAddress: string, address: string) => {

        //const encoder = new TextEncoder();
        try{
            const metaevidenceObj = {
                fileURI: this.safientAgreementURI,
                fileHash: 'QmPMdGmenYuh9kzhU6WkEvRsWpr1B8T7nVWA52u6yoJu13',
                fileTypeExtension: 'png',
                category: 'Safex Claims',
                title: 'Provide a convenient and safe way to propose and claim the inheritance and safekeeping mechanism',
                description:
                  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
                aliases: {
                  [safexMainContractAddress]: 'SafexMain',
                  [address]: [address],
                },
                question: 'Does the claimer qualify for inheritence?',
                rulingOptions: {
                  type: 'single-select',
                  titles: ['Yes', 'No'],
                  descriptions: ['The claimer is qualified for inheritence', 'The claimer is not qualified for inheritence'],
                },
              };
              const cid: any = await ipfsPublish('metaEvidence.json', JSON.stringify(metaevidenceObj));
              const metaevidenceURI = `/ipfs/${cid[1].hash}${cid[0].path}`;
              return metaevidenceURI
        }catch(err){
            throw new Error(`Error while creating metadata, ${err}`)
        }
        
      }


      createClaimEvidenceUri = async(file: any, evidenceName: string, description: string ): Promise<any> => {
        try{
            let evidenceURI: string = ''
            let buffer: Buffer | undefined
            let evidenceObj: Evidence
            let cid: any

            if(file && file.name.split('.')[1] ){
            const fileName: string = file.name;
            const fileExtension: string = file.name.split('.')[1]
            if(environment.isBrowser){
                const reader: any = new FileReader();
                reader.readAsArrayBuffer(file);
                reader.onloadend = () => {
                    buffer = Buffer.from(reader.result);
                };
                const fileCid = await ipfsPublish(fileName, buffer);
                const fileURI = `/ipfs/${fileCid[1].hash}${fileCid[0].path}`;
                evidenceObj = {
                  fileURI,
                  fileHash: fileCid[1].hash,
                  fileTypeExtension: fileExtension,
                  name: evidenceName,
                  description: description,
                };
             cid = await ipfsPublish('evidence.json', JSON.stringify(evidenceObj));
             evidenceURI = `/ipfs/${cid[1].hash}${cid[0].path}`;

            }
            if(environment.isNode){
                evidenceObj = {
                    fileURI: `https://ipfs.kleros.io/ipfs/QmXK5Arf1jWtox5gwVLX2jvoiJvdwiVsqAA2rTu7MUGBDF/signature.jpg`,
                    fileHash:'QmXK5Arf1jWtox5gwVLX2jvoiJvdwiVsqAA2rTu7MUGBDF',
                    fileTypeExtension: fileExtension,
                    name: evidenceName,
                    description: description,
                  };
                  //evidenceURI = `ipfs/QmXK5Arf1jWtox5gwVLX2jvoiJvdwiVsqAA2rTu7MUGBDF/signature.jpg`
                  cid = await ipfsPublish('evidence.json', JSON.stringify(evidenceObj));
                  evidenceURI = `/ipfs/${cid[1].hash}${cid[0].path}`;
            }
            }
            else{
                evidenceURI = "NULL"
            }

            return evidenceURI 

        }catch(e){
            throw new Error(`Error while creating evidence, ${e}`)
        }

      }
}
