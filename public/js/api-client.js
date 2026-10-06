class ApiClient
{

    async request(path, body, method)
    {
        let options = {method: method || (body ? 'POST' : 'GET'), headers: {'Accept': 'application/json'}};
        if(body){
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }
        let response = await fetch(path, options);
        let data = {};
        try{
            data = await response.json();
        }catch(error){
            data = {};
        }
        if(!response.ok){
            throw new Error(data.error || 'Request failed ('+response.status+')');
        }
        return data;
    }

}
