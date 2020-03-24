# url2pdf

Generate PDF file from input web link that uses [Chrome](https://www.google.com/chrome/) headless 'print as PDF' under the hood.
 Also support for sending pdf to specific email :).  
Please give [url2pdf.dev](https://url2pdf.dev) a try if you want to see how this project is in prodution. Feel free if you
want to deploy this to your own server.  

## Development

### Setup

Nodejs v10.15.0, see [.nvmrc](.nvmrc)  
Docker and Docker compose  
Chrome(Optional)  
wkhtml2pdf(Optional)  

### Start
The project support both local development with yarn and docker  
First, create an .env file
```
PROJECT_ID={{gcp_project_id}}
PORT={{port_to_start_server_on}}
CHROME_BIN={{chrome_executable_path}}
EMAIL_SERVICE={{email_service_provider}}
EMAIL_ADDRESS={{sender_email_address}}
EMAIL_PASSWORD={{sender_email_password}}
```
The file and its defined enviroment variables are optional.However, to make sure the software run properly 
with full feature, I suggest to configure them.  
*Local development*  
```
yarn install
yarn start
```
  
*Docker development*  
```
docker-compose build
```
To (re)build the docker image  
Later on, you can just  
```
docker-compose start
```
to use already built image.  
  
The latest built image was pushed to Google Cloud Register _gcr.io/url2pdf/url2pdf:latest_  

### Deployment
[url2pdf.dev](https://url2pdf.dev) was deployed to GCP k8s. You can find configuration of this deployment under [k8s](k8s)
sub directory.  

## License

See [LICENSE](LICENSE.md) (MIT)
