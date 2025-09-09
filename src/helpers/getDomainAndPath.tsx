export const getDomainAndPath = () => {
    return location.protocol + "//" + location.host + location.pathname;
};

export const getFullPath = (path: string) => {
    if (location.host === "localhost:3000"){
        return "http://localhost:5008" + path
    } else {
        return location.protocol + "//" + location.host + joinPath(location.pathname,path);
    }
};

function joinPath(pathname: string, path: string){
    if(pathname.endsWith('/') && path.startsWith('/')) {
        return pathname + path.slice(1);
    } else {
        return pathname + path;
    }
}