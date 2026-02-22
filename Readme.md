# 3.BUILD A RETRIEVAL-AUGMENTED GENERATION (RAG) SYSTEM THAT ANSWERS QUESTIONS USING A TEXTBOOK KNOWLEDGE BASE AND RETURNS VERIFIABLE REFERENCES (SECTIONS AND PAGE NUMBERS) 


## Folder Structure:

```
rag_system/
├── data/
│   ├── Book.pdf
│   └── queries.json
├── parent_store_local.zip/ (Compressed Parent Store for local testing)
├── chroma_db_local.zip/ (Compressed Chroma DB for local testing)
├── chroma_db/ (Chroma vector database files) -extracted from chroma_db_local.zip 
├── parent_store/ (Parent document storage files) -extracted from parent_store_local.zip
├── ingestion.ipynb (code for data ingestion and processing)
├── retriever.ipynb (code for the retriever)
├── requirements.txt
├── Submission.csv (final output with answers and references)
├── .gitignore
├── README.md

```

## Startup Instructions:
1. Clone the repository and navigate to the `rag_system` directory.
2. Install the required dependencies using pip:
    ```
    pip install -r requirements.txt
    ```
3. Run the `ingestion.ipynb` notebook to process the textbook and build the vector database.
4. Run the `retriever.ipynb` notebook to execute the retrieval and generation process, and to produce the `Submission.csv` file with answers and references.   

## Note: 
1. The `ingestion.ipynb` notebook includes code to handle the ingestion of the textbook, including text extraction, splitting, and vectorization. The `retriever.ipynb` notebook includes code to perform retrieval based on user queries and to generate answers with references.
2. The `parent_store_local.zip` and `chroma_db_local.zip` files are provided for local testing. You can extract them to the `parent_store/` and `chroma_db/` directories respectively, or you can set up your own persistent storage on disk by following the instructions in the `ingestion.ipynb` notebook.
3. Make sure to adjust the paths in the notebooks if you are using different locations for the data or storage.
4. The `queries.json` file contains the questions that will be used for retrieval and generation. You can modify this file to test with different queries.
5. Use Cuda for the BGE-M3 model to ensure efficient embedding generation. If you do not have access to Cuda-enabled hardware, you may need to adjust the code to run on CPU, but be aware that it will be significantly slower. 