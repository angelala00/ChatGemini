import { redirectToLoginIfPossible } from "./loginRedirect";

export const handleStreamingRequest = async(method: string, url:string, body?:string | FormData | URLSearchParams | Blob | ArrayBuffer | null, headers?:{}, streamCallback?: (response: any) => void, controller_signal?: any) => {
    return fetch(url, {
      method,
      body,
      headers: {
        ...headers
      },
      signal: controller_signal
    })
    .then(response => {
      if (!response.ok) {
        if (response.status === 401) {
          // 登录失效:带着当前路径(returnTo)跳 SSO 登录,登录后回到本页
          redirectToLoginIfPossible();
        } else {
          // 抛出其他错误
          const error = new Error(`请求失败，状态码：${response.status}`) as Error & {
            status?: number;
          };
          error.status = response.status;
          throw error;
        }
      }
      if (streamCallback) {
        streamCallback(response);
      }
    })
    .catch(error => {
      console.error('请求错误:', error);
      throw error;
    });
  }


  export const handleRequest = async(method: string, url:string, body?:string | FormData | URLSearchParams | Blob | ArrayBuffer | null, headers?:{}) => {
    return fetch(url, {
      method,
      body,
      headers: {
        ...headers
      }
    })
    .then(response => {
      if (!response.ok) {
        if (response.status === 401) {
          // 登录失效:带着当前路径(returnTo)跳 SSO 登录,登录后回到本页
          redirectToLoginIfPossible();
        } else {
          // 抛出其他错误
          const error = new Error(`请求失败，状态码：${response.status}`) as Error & {
            status?: number;
          };
          error.status = response.status;
          throw error;
        }
      }
      return response.json();
    })
    .catch(error => {
      console.error('请求错误:', error);
      throw error;
    });
  }
  
