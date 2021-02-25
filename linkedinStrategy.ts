import { OakContext, Options, AuthData, TokenData } from './types.ts';
/**
 * 
 * Creates an instance of `LinkedInStrategy`.
 * 
 *
 * * Options:
 *
 *   - client_id: string                  Required
 *   - client_secret: string              Required
 *   - redirect_uri: string               Required
 *
 */
export default class LinkedInStrategy {
  name: string = 'linkedIn'
  options: Options;
  uriFromParams: string;
  /**
   * @constructor
   * @param {Object} options
   * @api public
   */
  constructor (options: Options) {
    if (!options.client_id || !options.redirect_uri || !options.response_type || !options.scope || !options.client_secret) {
      throw new Error('ERROR in LinkedInStrategy constructor: Missing required arguments');
    }

    this.options = options;
    const paramArray: string[][] = Object.entries(options);
    let paramString: string = '';
    
    for (let i = 0; i < paramArray.length; i++) {
      let [key, value] = paramArray[i];

      if (key === 'client_secret' || key === 'grant_type') continue;

      paramString += (key + '=');

      if (i < paramArray.length - 1) paramString += (value + '&');
      else paramString += value;
    }

    this.uriFromParams = paramString;
  }

  async router(ctx: OakContext, next: Function) {
    if (!ctx.request.url.search) return await this.authorize(ctx, next);
    if (ctx.request.url.search.slice(1, 5) === 'code') return this.getAuthToken(ctx, next);
  }

  async authorize(ctx: OakContext, next: Function ) {
    return await ctx.response.redirect('https://www.linkedin.com/oauth/v2/authorization?' + this.uriFromParams);                   
  }

  async getAuthToken(ctx: OakContext, next: Function){
    const OGURI: string = ctx.request.url.search;

    if (OGURI.includes('error')) {
      return new Error('ERROR in getAuthToken: Received an error from auth token code request.');
    }

    let URI1: string[] = OGURI.split('=');
    const URI2: string[] = URI1[1].split('&');
    const code: string = this.parseCode(URI2[0]);
    const options: object = {
      method: 'POST',
      headers: { "Content-Type": "x-www-form-urlencoded"},
      body: JSON.stringify({
        grant_type: this.options.grant_type,
        client_id: this.options.client_id,
        client_secret: this.options.client_secret,
        code: code,
        redirect_uri: this.options.redirect_uri
      })
    } 

    try {
      let data: any = await fetch(`https://www.linkedin.com/oauth/v2/accessToken?grant_type=${this.options.grant_type}&redirect_uri=${this.options.redirect_uri}&client_id=${this.options.client_id}&client_secret=${this.options.client_secret}&code=${code}`)
      data = await data.json();

      return this.getAuthData(data);
    } catch(err) {
      return new Error(`ERROR in getAuthToken: Unable to obtain token - ${err}`);
    }
  }


  async getAuthData(parsed: TokenData){ 
    const authData: AuthData = { 
      tokenData: {
        access_token: parsed.access_token,
        expires_in: parsed.expires_in,
      },
      userInfo: {
        provider: '',
        providerUserId: ''
      }
    };
    const options: any = {
      headers: { 'Authorization': 'Bearer '+ parsed.access_token }
    };

    try {
      let data: any = await fetch(`https://api.linkedin.com/v2/me?projection=(id,firstName,lastName,profilePicture(displayImage~:playableStreams))&oauth2_access_token=${parsed.access_token}`);
      let emailData: any = await fetch(`https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))&oauth2_access_token=${parsed.access_token}`)
      data = await data.json();
      emailData = await emailData.json()

      authData.userInfo = {
        provider: this.name,
        providerUserId: data.id,
        displayName: data.firstName.localized.en_US + ' ' + data.lastName.localized.en_US,
        emails: [emailData.elements[0]['handle~'].emailAddress]
      };

      return authData;
    } catch(err) {
      return new Error(`ERROR in getAuthData: Unable to obtain auth data - ${err}`);
    }
  }

  parseCode(encodedCode: string): string {
    const replacements: { [name: string] : string } = {
      "%24": "$",
      "%26": "&",
      "%2B": "+",
      "%2C": ",",
      "%2F": "/",
      "%3A": ":",
      "%3B": ";",
      "%3D": "=",
      "%3F": "?",
      "%40": "@"
    }

    const toReplaceArray: string[] = Object.keys(replacements);

    for(let i = 0; i < toReplaceArray.length; i++) {
      while (encodedCode.includes(toReplaceArray[i])) {
        encodedCode = encodedCode.replace(toReplaceArray[i], replacements[toReplaceArray[i]]);
      }
    }

    return encodedCode; 
  }
}