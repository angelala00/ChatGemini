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
          // 跳转到登录页面
          window.location.href = '/';
        } else {
          // 抛出其他错误
          throw new Error(`请求失败，状态码：${response.status}`);
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
          // 跳转到登录页面
          window.location.href = '/';
        } else {
          // 抛出其他错误
          throw new Error(`请求失败，状态码：${response.status}`);
        }
      }
      return response.json();
    })
    .catch(error => {
      console.error('请求错误:', error);
      throw error;
    });
  }
  